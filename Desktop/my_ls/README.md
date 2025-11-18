# Welcome to My Ls
***

## Task
Create a simplified version of the Unix ls command called my_ls.
The program lists files and directories according to the options provided.
The main challenge is to correctly handle directory reading, file sorting,
 and command-line options (-a and -t) without using any forbidden functions or global variables.

## Description



This project replicates basic ls -1 behavior.

Displays one file per line.
Supports the following options:
-a: includes hidden files (starting with .).
-t: sorts by last modification time (st_mtim).
If multiple operands are passed, non-directory files appear first, then directories.
Sorting and printing follow the same logic as the real ls command.
The code uses only authorized system calls (opendir, readdir, lstat, etc.) and custom sorting functions.

## Installation
To build the program, use the provided Makefile:

make

To clean and rebuild:

make re

## Usage
./my_ls
./my_ls -a
./my_ls -t
./my_ls -at /etc
./my_ls file1 dir1

./my_ls > my_ls.output ls -1 > ls.output diff my_ls.output ls.output

### The Core Team


<span><i>Made at <a href='https://qwasar.io'>Qwasar SV -- Software Engineering School</a></i></span>
<span><img alt='Qwasar SV -- Software Engineering School's Logo' src='https://storage.googleapis.com/qwasar-public/qwasar-logo_50x50.png' width='20px' /></span>
