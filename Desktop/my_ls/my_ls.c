#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <dirent.h>
#include <sys/stat.h>
#include <unistd.h>

typedef struct s_file
{
    char *name;
    struct timespec mtime;
} t_file;

/* ---------- SORTING HELPERS ---------- */
static int compare_lexic(const t_file *a, const t_file *b)
{
    return strcmp(a->name, b->name);
}

static int compare_time(const t_file *a, const t_file *b)
{
    if (a->mtime.tv_sec != b->mtime.tv_sec)
        return (b->mtime.tv_sec > a->mtime.tv_sec) - (b->mtime.tv_sec < a->mtime.tv_sec);
    if (a->mtime.tv_nsec != b->mtime.tv_nsec)
        return (b->mtime.tv_nsec > a->mtime.tv_nsec) - (b->mtime.tv_nsec < a->mtime.tv_nsec);
    return strcmp(a->name, b->name);
}

/* ---------- SIMPLE BUBBLE SORT ---------- */
static void bubble_sort(t_file *arr, int n, int sort_time)
{
    int swapped = 1;
    while (swapped)
    {
        swapped = 0;
        for (int i = 0; i < n - 1; i++)
        {
            int cmp = sort_time ? compare_time(&arr[i], &arr[i + 1])
                                : compare_lexic(&arr[i], &arr[i + 1]);
            if (cmp > 0)
            {
                t_file tmp = arr[i];
                arr[i] = arr[i + 1];
                arr[i + 1] = tmp;
                swapped = 1;
            }
        }
    }
}

/* ---------- MEMORY CLEANUP ---------- */
static void free_files(t_file *files, int count)
{
    for (int i = 0; i < count; i++)
        free(files[i].name);
    free(files);
}

/* ---------- DIRECTORY LISTING ---------- */
static void list_dir(const char *path, int show_all, int sort_time)
{
    DIR *dir = opendir(path);
    if (!dir)
    {
        printf("%s\n", path);
        return;
    }

    struct dirent *entry;
    struct stat st;
    t_file *files = NULL;
    int count = 0;
    char fullpath[4096];

    while ((entry = readdir(dir)))
    {
        if (!show_all && entry->d_name[0] == '.')
            continue;

        files = realloc(files, sizeof(t_file) * (count + 1));
        if (!files)
            return;

        files[count].name = strdup(entry->d_name);
        snprintf(fullpath, sizeof(fullpath), "%s/%s", path, entry->d_name);
        if (lstat(fullpath, &st) == 0)
            files[count].mtime = st.st_mtim;
        else
        {
            files[count].mtime.tv_sec = 0;
            files[count].mtime.tv_nsec = 0;
        }
        count++;
    }
    closedir(dir);

    bubble_sort(files, count, sort_time);

    for (int i = 0; i < count; i++)
        printf("%s\n", files[i].name);

    free_files(files, count);
}

/* ---------- MAIN ---------- */
int main(int argc, char **argv)
{
    int show_all = 0;
    int sort_time = 0;
    int start = 1;

    /* Parse flags */
    while (start < argc && argv[start][0] == '-')
    {
        for (int i = 1; argv[start][i]; i++)
        {
            if (argv[start][i] == 'a')
                show_all = 1;
            else if (argv[start][i] == 't')
                sort_time = 1;
        }
        start++;
    }

    if (start == argc)
    {
        list_dir(".", show_all, sort_time);
        return 0;
    }

    /* Separate files and directories */
    t_file *dirs = NULL;
    t_file *files = NULL;
    int dir_count = 0, file_count = 0;
    struct stat st;

    for (int i = start; i < argc; i++)
    {
        if (lstat(argv[i], &st) != 0)
            continue;

        if (S_ISDIR(st.st_mode))
        {
            dirs = realloc(dirs, sizeof(t_file) * (dir_count + 1));
            dirs[dir_count].name = strdup(argv[i]);
            dirs[dir_count].mtime = st.st_mtim;
            dir_count++;
        }
        else
        {
            files = realloc(files, sizeof(t_file) * (file_count + 1));
            files[file_count].name = strdup(argv[i]);
            files[file_count].mtime = st.st_mtim;
            file_count++;
        }
    }

    /* Sort them */
    bubble_sort(files, file_count, sort_time);
    bubble_sort(dirs, dir_count, sort_time);

    /* Print files first */
    for (int i = 0; i < file_count; i++)
        printf("%s\n", files[i].name);

    /* Then directories */
    for (int i = 0; i < dir_count; i++)
    {
        if (file_count + dir_count > 1)
            printf("%s:\n", dirs[i].name);
        list_dir(dirs[i].name, show_all, sort_time);
        if (i != dir_count - 1)
            printf("\n");
    }

    free_files(files, file_count);
    free_files(dirs, dir_count);
    return 0;
}
