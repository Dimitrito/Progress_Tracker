# UI Pages Structure

## Загальна логіка

Застосунок побудований навколо:

Organization → Projects → Tasks → Metrics

Користувач:
- входить в систему
- обирає організацію
- працює з проєктами
- працює з задачами
- переглядає метрики

---

## Головна навігація (Sidebar)

1. Organizations
2. Projects
3. Tasks / Dashboard
4. Invitations
5. Profile

---

# 1. Auth Pages

## Login
- email
- password
- кнопка Login

## Register
- email
- first name
- last name
- password

---

# 2. Organizations

## Organizations List
Список організацій користувача

Елементи:
- назва
- роль (Admin / Member)
- дата створення

Дії:
- Create Organization
- Open Organization

---

## Organization Detail

Секції:

### Members
- список користувачів
- роль (Admin / Member)

### Join Requests (тільки для admin)
- список заявок
- approve / reject

### Invitations
- список інвайтів
- статус

### Projects
- список проєктів організації

---

# 3. Projects

## Projects List

Список проєктів в організації

Елементи:
- назва
- manager
- дати
- короткий опис

Дії:
- Create Project
- Open Project

---

## Project Detail

Основна сторінка проєкту

Блоки:

### Project Info
- назва
- опис
- manager
- дати

---

### Members
- список учасників
- роль в проєкті
- додавання учасників

---

### Roles
- список ролей (frontend, backend, etc)
- створення ролей

---

### Tasks
- список задач

---

### Metrics (важливо 🔥)
- task stats
- health score
- user progress

---

# 4. Tasks

## Tasks List

Таблиця задач:

- title
- status
- assignee
- deadline
- story points

Дії:
- створити задачу
- змінити статус
- переглянути деталі

---

## Task Detail (опціонально)
- опис
- статус
- дедлайн
- історія

(можна зробити пізніше, не обов'язково для MVP)

---

# 5. Metrics / Dashboard

## Project Dashboard

Блоки:

### Task Stats
- total
- todo
- in progress
- done
- overdue

---

### Project Health Score
- score (0–100)
- статус (good / warning / critical)

---

### User Progress
- таблиця:
  - user
  - tasks
  - completed
  - points
  - overdue

---

(це одна з ключових сторінок для диплома)

---

# 6. Invitations

## My Invitations
- список інвайтів
- accept / decline

---

# 7. Profile

## User Profile
- email
- first name
- last name
- avatar

---

# 8. Навігаційна логіка

### Sidebar
завжди доступний

---

### Organization → Projects
користувач спочатку обирає організацію

---

### Project → Detail
після вибору проєкту відкривається його сторінка

---

# 9. MVP скорочення (важливо)

Щоб не перегрузитись:

Обов'язково:
- login/register
- organizations list
- projects list
- project detail
- tasks list
- metrics

Можна відкласти:
- task detail page
- складні фільтри
- drag & drop
- історію змін

---

# 10. Результат

Інтерфейс повинен дозволяти:

- створити організацію
- створити проєкт
- додати людей
- створити задачі
- змінювати статус
- бачити аналітику

Це і є core продукт.