FROM nginx:alpine

# Remove a configuração padrão do Nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copia as configurações personalizadas
COPY conf.d/ /etc/nginx/conf.d/

# Cria diretórios necessários
RUN mkdir -p /var/log/nginx && \
    mkdir -p /etc/nginx/ssl

# Expõe as portas 80 e 443
EXPOSE 80 443

# Instala o bash (necessário para wait-for-it)
RUN apk add --no-cache bash

# Instala o wait-for-it
ADD https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh /wait-for-it.sh
RUN chmod +x /wait-for-it.sh

# Altere o entrypoint para aguardar o bitbook-api:3000
ENTRYPOINT ["/wait-for-it.sh", "bitbook-api:3000", "--", "nginx", "-g", "daemon off;"] 