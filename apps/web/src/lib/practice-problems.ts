import type { SupportedLanguage } from "@interviewhub/types";

// No "server-only": the practice page renders these on the client.

export interface PracticeProblem {
  id: string;
  title: string;
  difficulty: "Easy" | "Medium";
  /** Plain paragraphs, one per array entry. */
  statement: string[];
  sampleInput: string;
  sampleOutput: string;
}

export const PRACTICE_PROBLEMS: PracticeProblem[] = [
  {
    id: "fizzbuzz",
    title: "FizzBuzz",
    difficulty: "Easy",
    statement: [
      "Read a whole number n. Print the numbers from 1 to n, one per line.",
      "For multiples of 3 print Fizz instead, for multiples of 5 print Buzz, and for multiples of both print FizzBuzz.",
    ],
    sampleInput: "15",
    sampleOutput: "1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz",
  },
  {
    id: "reverse-words",
    title: "Reverse the words",
    difficulty: "Easy",
    statement: [
      "Read one line of words separated by single spaces.",
      "Print the same words in reverse order, separated by single spaces.",
    ],
    sampleInput: "the sky is blue",
    sampleOutput: "blue is sky the",
  },
  {
    id: "two-sum",
    title: "Two sum",
    difficulty: "Medium",
    statement: [
      "The first line holds space-separated integers; the second line holds a target.",
      "Print the indices i and j (i < j, zero-based) of the two numbers that add up to the target, separated by a space. Exactly one pair does.",
      "Aim for a single pass rather than checking every pair.",
    ],
    sampleInput: "2 7 11 15\n9",
    sampleOutput: "0 1",
  },
  {
    id: "balanced-brackets",
    title: "Balanced brackets",
    difficulty: "Medium",
    statement: [
      "Read one line made only of the characters ( ) [ ] { }.",
      "Print true if every bracket is closed by the matching kind in the right order, otherwise false.",
    ],
    sampleInput: "{[()]}()",
    sampleOutput: "true",
  },
];

/**
 * A starting file per language that already reads all of stdin — the part
 * that differs most between languages and has nothing to do with the problem.
 * Written for the compiler versions infra/judge0 actually runs (see
 * JUDGE0_LANGUAGE_ID): Go 1.13 predates io.ReadAll, and TypeScript 3.7
 * compiles without Node's type definitions.
 */
export const STARTER_CODE: Record<SupportedLanguage, string> = {
  javascript: `const input = require("fs").readFileSync(0, "utf8");

// Solve the problem using \`input\`, then print the answer.
console.log(input.trim());
`,
  typescript: `declare const require: (module: string) => { readFileSync(fd: number, encoding: string): string };

const input: string = require("fs").readFileSync(0, "utf8");

// Solve the problem using \`input\`, then print the answer.
console.log(input.trim());
`,
  python: `import sys

data = sys.stdin.read()

# Solve the problem using \`data\`, then print the answer.
print(data.strip())
`,
  java: `import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder input = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            input.append(line).append('\\n');
        }

        // Solve the problem using \`input\`, then print the answer.
        System.out.println(input.toString().trim());
    }
}
`,
  cpp: `#include <iostream>
#include <sstream>
#include <string>
using namespace std;

int main() {
    stringstream buffer;
    buffer << cin.rdbuf();
    string input = buffer.str();

    // Solve the problem using \`input\`, then print the answer.
    cout << input << endl;
    return 0;
}
`,
  go: `package main

import (
	"fmt"
	"io/ioutil"
	"os"
	"strings"
)

func main() {
	data, _ := ioutil.ReadAll(os.Stdin)
	input := strings.TrimSpace(string(data))

	// Solve the problem using input, then print the answer.
	fmt.Println(input)
}
`,
};

/**
 * Compares program output to an expected answer the way a person would read
 * it: trailing spaces on a line and trailing blank lines don't count, since
 * print() and println add them freely. Everything else must match exactly.
 */
export function outputMatches(actual: string | null, expected: string): boolean {
  if (actual === null) return false;
  const normalise = (text: string) =>
    text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trimEnd();
  return normalise(actual) === normalise(expected);
}
