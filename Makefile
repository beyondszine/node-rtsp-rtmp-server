DOCKER_IMAGE_NAME = node-rtsp-rtmp-server
ME_USER = saurabhshandy
VIDEOS_DIR = /home/beyond/Videos
DATA_DIR = /data

build:
	docker build -t ${ME_USER}/${DOCKER_IMAGE_NAME} .

# If you have to configure volumes, do that from here
# configure:

run:
	(docker start ${DOCKER_IMAGE_NAME}) || \
	docker run \
  -p 8000:8000 -p 1935:1935 \
  --name ${DOCKER_IMAGE_NAME} \
  -e dataDir=${DATA_DIR} \
  -v ${VIDEOS_DIR}:${DATA_DIR} \
  ${ME_USER}/${DOCKER_IMAGE_NAME}

console:
	docker run -it \
  -p 8000:8000 -p 1935:1935 \
  -e an_env_var=${HIDDEN_ENV} \
  ${ME_USER}/${DOCKER_IMAGE_NAME} bash

.PHONY: build
