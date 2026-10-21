/* Your own code in the Code scene (optional).
   1. Copy this file to snippets.js in Lively's copy of the wallpaper (install.bat prints that folder), then reload
      the wallpaper.
   2. Add as many as you like. The file extension picks the comment colour and the badge (c, py, js, rs, sql, v, go, ...).
   Up to 18 lines each; long lines are cut to fit. Tip: use backticks (`...`) so the code can span several lines. */
window.CS_SNIPPETS = [
  {
    file: 'hello.py',
    code: `
def greet(name):
    # say hello
    return f"Hello, {name}!"

print(greet("world"))
`
  },
  {
    file: 'fizzbuzz.go',
    code: `
package main

import "fmt"

func main() {
    for i := 1; i <= 15; i++ {
        switch {
        case i%15 == 0:
            fmt.Println("FizzBuzz")
        case i%3 == 0:
            fmt.Println("Fizz")
        default:
            fmt.Println(i)
        }
    }
}
`
  }
];
