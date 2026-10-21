// CsSys - the system reader used by helper\cs-load.ps1.
// Compiled once on the user's PC into CsSys.dll (the helper rebuilds it automatically when this file changes).
//
//   CPU      Windows PDH counter "Processor Utility" (the number Task Manager shows)
//   GPU      NVIDIA NVML (no process spawn), else the PDH "GPU Engine" 3D counters (any vendor), else -1 (unknown)
//   RAM      kernel32 GlobalMemoryStatusEx
//   battery  kernel32 GetSystemPowerStatus
//   network  .NET NetworkInterface byte counters (speed = difference between two calls)
//   disk     .NET DriveInfo of the Windows drive (refreshed every 30 s)
//
// Line() returns the whole text of data\load.js: one JavaScript call the page runs when it loads the file.
using System;
using System.Globalization;
using System.IO;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

public static class CsSys {

  // ============================================================ native APIs (P/Invoke)

  // ---- RAM: MEMORYSTATUSEX ----
  [StructLayout(LayoutKind.Sequential)]
  struct MEM {
    public uint len;     // size of this struct, must be set before the call
    public uint load;    // memory in use, percent
    public ulong total, avail, totalPageFile, availPageFile, totalVirtual, availVirtual, availExtendedVirtual;
  }
  [DllImport("kernel32.dll")] static extern bool GlobalMemoryStatusEx(ref MEM m);

  // ---- battery: SYSTEM_POWER_STATUS ----
  [StructLayout(LayoutKind.Sequential)]
  struct PWR {
    public byte ac;        // 1 = plugged in
    public byte flag;
    public byte percent;   // 255 = unknown (no battery)
    public byte saver;
    public uint life;      // seconds left, 0xFFFFFFFF = unknown
    public uint full;
  }
  [DllImport("kernel32.dll")] static extern bool GetSystemPowerStatus(out PWR p);

  // ---- performance counters (PDH) ----
  const uint PDH_FMT_DOUBLE = 0x200;
  const uint PDH_MORE_DATA = 0x800007D2;
  [StructLayout(LayoutKind.Explicit)]
  struct PDHVAL {   // PDH_FMT_COUNTERVALUE: status, then (8-byte aligned) the value
    [FieldOffset(0)] public uint status;
    [FieldOffset(8)] public double value;
  }
  [DllImport("pdh.dll", CharSet = CharSet.Unicode)] static extern uint PdhOpenQuery(string source, IntPtr user, out IntPtr query);
  [DllImport("pdh.dll", CharSet = CharSet.Unicode)] static extern uint PdhAddEnglishCounterW(IntPtr query, string path, IntPtr user, out IntPtr counter);
  [DllImport("pdh.dll")] static extern uint PdhCollectQueryData(IntPtr query);
  [DllImport("pdh.dll")] static extern uint PdhGetFormattedCounterValue(IntPtr counter, uint format, out uint type, out PDHVAL value);
  [DllImport("pdh.dll", CharSet = CharSet.Unicode)] static extern uint PdhGetFormattedCounterArrayW(IntPtr counter, uint format, ref uint size, out uint count, IntPtr items);

  // ---- NVIDIA GPU (NVML, installed with the NVIDIA driver) ----
  [StructLayout(LayoutKind.Sequential)]
  struct UTIL { public uint gpu, mem; }   // percent
  [DllImport("nvml.dll")] static extern int nvmlInit_v2();
  [DllImport("nvml.dll")] static extern int nvmlDeviceGetHandleByIndex_v2(uint index, out IntPtr device);
  [DllImport("nvml.dll")] static extern int nvmlDeviceGetUtilizationRates(IntPtr device, out UTIL util);

  // ---- memory trim ----
  [DllImport("psapi.dll")] static extern bool EmptyWorkingSet(IntPtr process);


  // ============================================================ state

  static IntPtr query, cpuCounter, gpuCounter, gpuHandle;
  static bool pdhOk, pdhGpuOk;
  public static bool NvmlOk;

  /// "nvml", "pdh" or "none" - the helper falls back to nvidia-smi only for "none"
  public static string GpuSource { get { return NvmlOk ? "nvml" : pdhGpuOk ? "pdh" : "none"; } }

  /// Extra fields appended to every load.js line, set once by the helper (hardware names), e.g. ",hw:{...}"
  public static string Extra = "";

  // kept between calls
  static long prevRx, prevTx;          // network byte counters at the previous call
  static DateTime prevT;               // time of the previous call
  static double dn, up;                // bytes per second
  static double diskPct, diskFreeGb;
  static DateTime diskT = DateTime.MinValue;

  static readonly CultureInfo Inv = CultureInfo.InvariantCulture;   // "1.5", never "1,5"
  static readonly string SysDrive = Path.GetPathRoot(Environment.SystemDirectory).Substring(0, 1);   // usually C
  static readonly Regex VirtualNic = new Regex("vEthernet|VirtualBox|VMware|Pseudo|Bluetooth");     // not counted as network
  const double GB = 1073741824.0;


  // ============================================================ readers

  public static void Init() {
    try {
      pdhOk = PdhOpenQuery(null, IntPtr.Zero, out query) == 0
           && PdhAddEnglishCounterW(query, "\\Processor Information(_Total)\\% Processor Utility", IntPtr.Zero, out cpuCounter) == 0;
      if (pdhOk) PdhCollectQueryData(query);   // rates need two samples: take the first one now
    } catch { pdhOk = false; }

    try {
      NvmlOk = nvmlInit_v2() == 0 && nvmlDeviceGetHandleByIndex_v2(0, out gpuHandle) == 0;
    } catch { NvmlOk = false; }   // no nvml.dll: not an NVIDIA PC

    if (!NvmlOk && pdhOk) {
      try {
        pdhGpuOk = PdhAddEnglishCounterW(query, "\\GPU Engine(*engtype_3D)\\Utilization Percentage", IntPtr.Zero, out gpuCounter) == 0;
        if (pdhGpuOk) PdhCollectQueryData(query);
      } catch { pdhGpuOk = false; }
    }
  }

  static int Cpu() {
    if (!pdhOk) return 0;
    PdhCollectQueryData(query);   // one collection per tick, also used by PdhGpu()
    uint type; PDHVAL v;
    if (PdhGetFormattedCounterValue(cpuCounter, PDH_FMT_DOUBLE, out type, out v) != 0) return 0;
    return (int)Math.Max(0, Math.Min(100, Math.Round(v.value)));
  }

  static int Gpu() {
    UTIL u;
    if (NvmlOk) return nvmlDeviceGetUtilizationRates(gpuHandle, out u) == 0 ? (int)u.gpu : -1;
    return pdhGpuOk ? PdhGpu() : -1;
  }

  /// 3D utilisation summed over every instance (one per process and engine), like Task Manager's GPU column.
  static int PdhGpu() {
    // first call: ask how big the array is
    uint size = 0, count;
    if (PdhGetFormattedCounterArrayW(gpuCounter, PDH_FMT_DOUBLE, ref size, out count, IntPtr.Zero) != PDH_MORE_DATA || size == 0)
      return count == 0 ? 0 : -1;

    IntPtr buf = Marshal.AllocHGlobal((int)size);
    try {
      if (PdhGetFormattedCounterArrayW(gpuCounter, PDH_FMT_DOUBLE, ref size, out count, buf) != 0) return -1;
      // PDH_FMT_COUNTERVALUE_ITEM_W is 24 bytes: name pointer @0, status @8, double value @16
      double sum = 0;
      for (int i = 0; i < count; i++) {
        IntPtr item = buf + i * 24;
        if (Marshal.ReadInt32(item + 8) != 0) continue;   // instance not valid yet (new process)
        sum += BitConverter.Int64BitsToDouble(Marshal.ReadInt64(item + 16));
      }
      return (int)Math.Max(0, Math.Min(100, Math.Round(sum)));
    } finally {
      Marshal.FreeHGlobal(buf);
    }
  }

  /// Total bytes received / sent on the real network adapters (skips loopback, tunnels, virtual and Bluetooth adapters).
  static void NetBytes(out long rx, out long tx) {
    rx = 0; tx = 0;
    foreach (var n in NetworkInterface.GetAllNetworkInterfaces()) {
      if (n.OperationalStatus != OperationalStatus.Up) continue;
      var type = n.NetworkInterfaceType;
      if (type == NetworkInterfaceType.Loopback || type == NetworkInterfaceType.Tunnel) continue;
      if (VirtualNic.IsMatch(n.Name)) continue;
      var s = n.GetIPv4Statistics();
      rx += s.BytesReceived;
      tx += s.BytesSent;
    }
  }

  static string F(double v) { return v.ToString("0.0", Inv); }


  // ============================================================ public API

  /// The text of load.js. gpuOverride >= 0 replaces the GPU value (nvidia-smi fallback). GPU -1 = unknown.
  /// Format:  window.__csLoad && window.__csLoad(cpu, gpu, { k: key, b: battery%, c: plugged, bt: seconds left,
  ///          ram: %, ru: GB used, rt: GB total, dk: disk %, df: GB free, dl: drive letter, dn/up: bytes/s, hw: {...} });
  public static string Line(string key, int gpuOverride) {
    int cpu = Cpu();
    int gpu = gpuOverride >= 0 ? gpuOverride : Gpu();

    var m = new MEM();
    m.len = (uint)Marshal.SizeOf(typeof(MEM));
    GlobalMemoryStatusEx(ref m);

    PWR p;
    GetSystemPowerStatus(out p);
    int bat = p.percent == 255 ? -1 : p.percent;
    int plugged = p.ac == 1 ? 1 : 0;
    int left = p.life == 0xFFFFFFFF ? -1 : (int)p.life;

    // network speed = bytes since the previous call / seconds since the previous call
    long rx, tx;
    NetBytes(out rx, out tx);
    var now = DateTime.UtcNow;
    if (prevT != default(DateTime)) {
      double s = (now - prevT).TotalSeconds;
      if (s > 0.2) {
        dn = Math.Max(0, (rx - prevRx) / s);
        up = Math.Max(0, (tx - prevTx) / s);
      }
    }
    prevRx = rx; prevTx = tx; prevT = now;

    // disk usage changes slowly: every 30 s
    if ((now - diskT).TotalSeconds > 30) {
      try {
        var d = new DriveInfo(SysDrive);
        diskPct = Math.Round(100.0 * (d.TotalSize - d.AvailableFreeSpace) / d.TotalSize);
        diskFreeGb = d.AvailableFreeSpace / GB;
      } catch { }
      diskT = now;
    }

    return "window.__csLoad && window.__csLoad(" + cpu + "," + gpu + ","
         + "{k:'" + key + "',b:" + bat + ",c:" + plugged + ",bt:" + left
         + ",ram:" + F(m.load) + ",ru:" + F((m.total - m.avail) / GB) + ",rt:" + F(m.total / GB)
         + ",dk:" + diskPct + ",df:" + F(diskFreeGb) + ",dl:'" + SysDrive + "'"
         + ",dn:" + (long)dn + ",up:" + (long)up
         + Extra + "});";
  }

  /// Gives unused memory back to Windows (lowers the number Task Manager shows for this process).
  public static void Trim() {
    try {
      GC.Collect();
      EmptyWorkingSet(System.Diagnostics.Process.GetCurrentProcess().Handle);
    } catch { }
  }
}
