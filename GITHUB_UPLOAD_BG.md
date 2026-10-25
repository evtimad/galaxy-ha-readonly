# Качване в GitHub през браузър

1. Влезте в GitHub.
2. Изберете **New repository**.
3. Име: `galaxy-ha-readonly`.
4. Изберете **Private**.
5. Не добавяйте README, `.gitignore` или License.
6. Създайте repository-то.
7. Изберете **uploading an existing file**.
8. Качете цялото съдържание на тази папка, така че `repository.yaml` да бъде в основната директория.
9. Commit message: `Initial Galaxy read-only Home Assistant App`.
10. Изберете **Commit changes**.

## Проверка на структурата

След качването началната страница трябва да съдържа директно:

```text
repository.yaml
galaxy_readonly/
.github/
README.md
INSTALL.md
LICENSE
```

Не качвайте ZIP файла като единствен файл. Home Assistant трябва да вижда разархивираната структура.
