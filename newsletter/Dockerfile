FROM composer:2 AS vendor
WORKDIR /service
COPY composer.json composer.lock* ./
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader

FROM php:8.3-apache
RUN apt-get update \
    && apt-get install -y --no-install-recommends libonig-dev libfreetype6-dev libjpeg62-turbo-dev libpng-dev fonts-noto-core \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install pdo_mysql mbstring gd \
    && rm -rf /var/lib/apt/lists/*
COPY --from=vendor /service/vendor /var/www/vendor
COPY src /var/www/src
COPY public /var/www/html
COPY assets /var/www/assets
RUN chown -R www-data:www-data /var/www
EXPOSE 80
