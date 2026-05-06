Deployment
Production запуск виконується через Docker Compose.

1. Клонування репозиторію
git clone https://github.com/Dimitrito/Progress_Tracker.git
cd Progress_Tracker

2. Налаштування env
cp .env.prod.example .env.prod
У файлі .env.prod замінити SERVER_IP на IP-адресу або домен сервера.

Приклад:
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,10.10.5.23
CSRF_TRUSTED_ORIGINS=http://10.10.5.23:5005
CORS_ALLOWED_ORIGINS=http://10.10.5.23:5005

3. Запуск контейнерів
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

4. Міграції та static files
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend python manage.py migrate
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend python manage.py collectstatic --noinput

5. Створення адміністратора
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend python manage.py createsuperuser
