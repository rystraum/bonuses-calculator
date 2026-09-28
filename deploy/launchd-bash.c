// launchd-bash: tiny exec wrapper for launchd jobs that need Full Disk Access.
//
// macOS TCC attributes file-access grants to the executable launchd spawns.
// A launchd job running /bin/bash directly gets no TCC grant, so it cannot
// access protected locations (e.g. external/removable volumes). This wrapper
// exists so a single, dedicated binary can be granted Full Disk Access; the
// grant then covers the whole process tree it launches.
//
// Build:  clang -O2 -o "$HOME/bin/launchd-bash" launchd-bash.c
// Grant:  System Settings > Privacy & Security > Full Disk Access > add ~/bin/launchd-bash
#include <stdio.h>
#include <unistd.h>

int main(int argc, char **argv)
{
	if (argc < 2) {
		fprintf(stderr, "usage: %s SCRIPT [ARGS...]\n", argv[0]);
		return 64;
	}
	argv[0] = (char *)"/bin/bash";
	execv("/bin/bash", argv);
	perror("execv");
	return 127;
}
