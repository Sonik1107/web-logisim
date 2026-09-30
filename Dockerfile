FROM nginx:stable-alpine

COPY index.html style.css *.js /usr/share/nginx/html/
COPY editor/ /usr/share/nginx/html/editor/

EXPOSE 80
