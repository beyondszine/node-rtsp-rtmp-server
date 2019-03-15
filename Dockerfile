FROM ubuntu:16.04
RUN apt-get update && apt-get -y install curl dnsutils iputils-ping
RUN curl -sL https://deb.nodesource.com/setup_10.x -o nodesource_setup.sh
RUN bash nodesource_setup.sh
RUN apt-get -y install nodejs

# Create app directory 
# The idea is to have /home/<language/framework>/repository
RUN mkdir -p /home/nodejs/app
WORKDIR /home/nodejs/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)

COPY . .
RUN npm install -d
RUN npm audit fix

# RUN npm audit fix
EXPOSE 8000
EXPOSE 1935
# override dataDir by passing env variable while running docker to serve your own video files.
ENV dataDir /home/nodejs/app/file 
ENV HTTP_PORT 8000 
ENV RTMP_PORT 1935
ENV TINI_VERSION v0.18.0
# Add Tini
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini
ENTRYPOINT ["/tini", "--"]

# RUN groupadd -r nodejs && useradd -m -r -g nodejs nodejs
# USER nodejs

CMD ["npm", "start"]
# CMD ["npm","run","devstart"]
