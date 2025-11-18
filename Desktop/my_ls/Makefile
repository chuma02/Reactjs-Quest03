NAME = my_ls
CC = gcc
CFLAGS = -Wall -Wextra -Werror

SRC = my_ls.c

all: $(NAME)

$(NAME): $(SRC)
	$(CC) $(CFLAGS) $(SRC) -o $(NAME)

clean:
	rm -f $(NAME)

fclean: clean

re: fclean all
