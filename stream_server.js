// Generated by CoffeeScript 2.3.2
(function() {
  // RTSP and RTMP/RTMPE/RTMPT/RTMPTE server implementation.
  // Also serves HTTP contents as this server is meant to
  // be run on port 80.
  var Bits, CustomReceiver, DEBUG_INCOMING_PACKET_DATA, DEBUG_INCOMING_PACKET_HASH, DEFAULT_SERVER_NAME, Sequent, StreamServer, aac, avstreams, config, crypto, fs, h264, http, logger, mp4, net, packageJson, ref, rtmp, rtsp, serverName;

  net = require('net');

  fs = require('fs');

  crypto = require('crypto');

  config = require('./config');

  rtmp = require('./rtmp');

  http = require('./http');

  rtsp = require('./rtsp');

  h264 = require('./h264');

  aac = require('./aac');

  mp4 = require('./mp4');

  Bits = require('./bits');

  avstreams = require('./avstreams');

  CustomReceiver = require('./custom_receiver');

  logger = require('./logger');

  packageJson = require('./package.json');

  Sequent = require('sequent');

  // If true, incoming video/audio packets are printed to the console
  DEBUG_INCOMING_PACKET_DATA = false;

  // If true, hash value of each incoming video/audio access unit is printed to the console
  DEBUG_INCOMING_PACKET_HASH = false;

  //# Default server name for RTSP and HTTP responses
  DEFAULT_SERVER_NAME = `node-rtsp-rtmp-server/${packageJson.version}`;

  serverName = (ref = config.serverName) != null ? ref : DEFAULT_SERVER_NAME;

  StreamServer = class StreamServer {
    constructor(opts) {
      var httpHandler, ref1, rtmptCallback;
      this.serverName = (ref1 = opts != null ? opts.serverName : void 0) != null ? ref1 : serverName;
      if (config.enableRTMP || config.enableRTMPT) {
        // Create RTMP server
        this.rtmpServer = new rtmp.RTMPServer;
        this.rtmpServer.on('video_start', (streamId) => {
          var stream;
          stream = avstreams.getOrCreate(streamId);
          return this.onReceiveVideoControlBuffer(stream);
        });
        this.rtmpServer.on('video_data', (streamId, pts, dts, nalUnits) => {
          var stream;
          stream = avstreams.get(streamId);
          if (stream != null) {
            return this.onReceiveVideoPacket(stream, nalUnits, pts, dts);
          } else {
            return logger.warn(`warn: Received invalid streamId from rtmp: ${streamId}`);
          }
        });
        this.rtmpServer.on('audio_start', (streamId) => {
          var stream;
          stream = avstreams.getOrCreate(streamId);
          return this.onReceiveAudioControlBuffer(stream);
        });
        this.rtmpServer.on('audio_data', (streamId, pts, dts, adtsFrame) => {
          var stream;
          stream = avstreams.get(streamId);
          if (stream != null) {
            return this.onReceiveAudioPacket(stream, adtsFrame, pts, dts);
          } else {
            return logger.warn(`warn: Received invalid streamId from rtmp: ${streamId}`);
          }
        });
      }
      if (config.enableCustomReceiver) {
        // Setup data receivers for custom protocol
        this.customReceiver = new CustomReceiver(config.receiverType, {
          videoControl: (...args) => {
            return this.onReceiveVideoControlBuffer(...args);
          },
          audioControl: (...args) => {
            return this.onReceiveAudioControlBuffer(...args);
          },
          videoData: (...args) => {
            return this.onReceiveVideoDataBuffer(...args);
          },
          audioData: (...args) => {
            return this.onReceiveAudioDataBuffer(...args);
          }
        });
        // Delete old sockets
        this.customReceiver.deleteReceiverSocketsSync();
      }
      if (config.enableHTTP) {
        this.httpHandler = new http.HTTPHandler({
          serverName: this.serverName,
          documentRoot: opts != null ? opts.documentRoot : void 0
        });
      }
      if (config.enableRTSP || config.enableHTTP || config.enableRTMPT) {
        if (config.enableRTMPT) {
          rtmptCallback = (...args) => {
            return this.rtmpServer.handleRTMPTRequest(...args);
          };
        } else {
          rtmptCallback = null;
        }
        if (config.enableHTTP) {
          httpHandler = this.httpHandler;
        } else {
          httpHandler = null;
        }
        this.rtspServer = new rtsp.RTSPServer({
          serverName: this.serverName,
          httpHandler: httpHandler,
          rtmptCallback: rtmptCallback
        });
        this.rtspServer.on('video_start', (stream) => {
          return this.onReceiveVideoControlBuffer(stream);
        });
        this.rtspServer.on('audio_start', (stream) => {
          return this.onReceiveAudioControlBuffer(stream);
        });
        this.rtspServer.on('video', (stream, nalUnits, pts, dts) => {
          return this.onReceiveVideoNALUnits(stream, nalUnits, pts, dts);
        });
        this.rtspServer.on('audio', (stream, accessUnits, pts, dts) => {
          return this.onReceiveAudioAccessUnits(stream, accessUnits, pts, dts);
        });
      }
      avstreams.on('new', function(stream) {
        if (DEBUG_INCOMING_PACKET_HASH) {
          return stream.lastSentVideoTimestamp = 0;
        }
      });
      avstreams.on('reset', function(stream) {
        if (DEBUG_INCOMING_PACKET_HASH) {
          return stream.lastSentVideoTimestamp = 0;
        }
      });
      avstreams.on('end', (stream) => {
        if (config.enableRTSP) {
          this.rtspServer.sendEOS(stream);
        }
        if (config.enableRTMP || config.enableRTMPT) {
          return this.rtmpServer.sendEOS(stream);
        }
      });
      // for mp4
      avstreams.on('audio_data', (stream, data, pts) => {
        return this.onReceiveAudioAccessUnits(stream, [data], pts, pts);
      });
      avstreams.on('video_data', (stream, nalUnits, pts, dts) => {
        if (dts == null) {
          dts = pts;
        }
        return this.onReceiveVideoNALUnits(stream, nalUnits, pts, dts);
      });
      avstreams.on('audio_start', (stream) => {
        return this.onReceiveAudioControlBuffer(stream);
      });
      avstreams.on('video_start', (stream) => {
        return this.onReceiveVideoControlBuffer(stream);
      });
    }

    //# TODO: Do we need to do something for remove_stream event?
    //avstreams.on 'remove_stream', (stream) ->
    //  logger.raw "received remove_stream event from stream #{stream.id}"
    attachRecordedDir(dir) {
      if (config.recordedApplicationName != null) {
        logger.info(`attachRecordedDir: dir=${dir} app=${config.recordedApplicationName}`);
        return avstreams.attachRecordedDirToApp(dir, config.recordedApplicationName);
      }
    }

    attachMP4(filename, streamName) {
      var context, generator;
      logger.info(`attachMP4: file=${filename} stream=${streamName}`);
      context = this;
      generator = new avstreams.AVStreamGenerator({
        // Generate an AVStream upon request
        generate: function() {
          var ascBuf, ascInfo, audioSpecificConfig, bits, err, mp4File, mp4Stream, streamId;
          try {
            mp4File = new mp4.MP4File(filename);
          } catch (error) {
            err = error;
            logger.error(`error opening MP4 file ${filename}: ${err}`);
            return null;
          }
          streamId = avstreams.createNewStreamId();
          mp4Stream = new avstreams.MP4Stream(streamId);
          logger.info(`created stream ${streamId} from ${filename}`);
          avstreams.emit('new', mp4Stream);
          avstreams.add(mp4Stream);
          mp4Stream.type = avstreams.STREAM_TYPE_RECORDED;
          audioSpecificConfig = null;
          mp4File.on('audio_data', function(data, pts) {
            return context.onReceiveAudioAccessUnits(mp4Stream, [data], pts, pts);
          });
          mp4File.on('video_data', function(nalUnits, pts, dts) {
            if (dts == null) {
              dts = pts;
            }
            return context.onReceiveVideoNALUnits(mp4Stream, nalUnits, pts, dts);
          });
          mp4File.on('eof', () => {
            return mp4Stream.emit('end');
          });
          mp4File.parse();
          mp4Stream.updateSPS(mp4File.getSPS());
          mp4Stream.updatePPS(mp4File.getPPS());
          ascBuf = mp4File.getAudioSpecificConfig();
          bits = new Bits(ascBuf);
          ascInfo = aac.readAudioSpecificConfig(bits);
          mp4Stream.updateConfig({
            audioSpecificConfig: ascBuf,
            audioASCInfo: ascInfo,
            audioSampleRate: ascInfo.samplingFrequency,
            audioClockRate: 90000,
            audioChannels: ascInfo.channelConfiguration,
            audioObjectType: ascInfo.audioObjectType
          });
          mp4Stream.durationSeconds = mp4File.getDurationSeconds();
          mp4Stream.lastTagTimestamp = mp4File.getLastTimestamp();
          mp4Stream.mp4File = mp4File;
          mp4File.fillBuffer(function() {
            context.onReceiveAudioControlBuffer(mp4Stream);
            return context.onReceiveVideoControlBuffer(mp4Stream);
          });
          return mp4Stream;
        },
        play: function() {
          return this.mp4File.play();
        },
        pause: function() {
          return this.mp4File.pause();
        },
        resume: function() {
          return this.mp4File.resume();
        },
        seek: function(seekSeconds, callback) {
          var actualStartTime;
          actualStartTime = this.mp4File.seek(seekSeconds);
          return callback(null, actualStartTime);
        },
        sendVideoPacketsSinceLastKeyFrame: function(endSeconds, callback) {
          return this.mp4File.sendVideoPacketsSinceLastKeyFrame(endSeconds, callback);
        },
        teardown: function() {
          this.mp4File.close();
          return this.destroy();
        },
        getCurrentPlayTime: function() {
          return this.mp4File.currentPlayTime;
        },
        isPaused: function() {
          return this.mp4File.isPaused();
        }
      });
      return avstreams.addGenerator(streamName, generator);
    }

    stop(callback) {
      if (config.enableCustomReceiver) {
        this.customReceiver.deleteReceiverSocketsSync();
      }
      return typeof callback === "function" ? callback() : void 0;
    }

    start(callback) {
      var seq, waitCount;
      seq = new Sequent;
      waitCount = 0;
      if (config.enableRTMP) {
        waitCount++;
        this.rtmpServer.start({
          port: config.rtmpServerPort
        }, function() {
          return seq.done();
        });
      }
      // RTMP server is ready
      if (config.enableCustomReceiver) {
        // Start data receivers for custom protocol
        this.customReceiver.start();
      }
      if (config.enableRTSP || config.enableHTTP || config.enableRTMPT) {
        waitCount++;
        this.rtspServer.start({
          port: config.serverPort
        }, function() {
          return seq.done();
        });
      }
      return seq.wait(waitCount, function() {
        return typeof callback === "function" ? callback() : void 0;
      });
    }

    setLivePathConsumer(func) {
      if (config.enableRTSP) {
        return this.rtspServer.setLivePathConsumer(func);
      }
    }

    setAuthenticator(func) {
      if (config.enableRTSP) {
        return this.rtspServer.setAuthenticator(func);
      }
    }

    // buf argument can be null (not used)
    onReceiveVideoControlBuffer(stream, buf) {
      stream.resetFrameRate(stream);
      stream.isVideoStarted = true;
      stream.timeAtVideoStart = Date.now();
      return stream.timeAtAudioStart = stream.timeAtVideoStart;
    }

    //  stream.spropParameterSets = ''

    // buf argument can be null (not used)
    onReceiveAudioControlBuffer(stream, buf) {
      stream.isAudioStarted = true;
      stream.timeAtAudioStart = Date.now();
      return stream.timeAtVideoStart = stream.timeAtAudioStart;
    }

    onReceiveVideoDataBuffer(stream, buf) {
      var dts, nalUnit, pts;
      pts = buf[1] * 0x010000000000 + buf[2] * 0x0100000000 + buf[3] * 0x01000000 + buf[4] * 0x010000 + buf[5] * 0x0100 + buf[6];
      // TODO: Support dts
      dts = pts;
      nalUnit = buf.slice(7);
      return this.onReceiveVideoPacket(stream, nalUnit, pts, dts);
    }

    onReceiveAudioDataBuffer(stream, buf) {
      var adtsFrame, dts, pts;
      pts = buf[1] * 0x010000000000 + buf[2] * 0x0100000000 + buf[3] * 0x01000000 + buf[4] * 0x010000 + buf[5] * 0x0100 + buf[6];
      // TODO: Support dts
      dts = pts;
      adtsFrame = buf.slice(7);
      return this.onReceiveAudioPacket(stream, adtsFrame, pts, dts);
    }

    // nal_unit_type 5 must not separated with 7 and 8 which
    // share the same timestamp as 5
    onReceiveVideoNALUnits(stream, nalUnits, pts, dts) {
      var hasVideoFrame, j, len, md5, nalUnit, nalUnitType, tsDiff;
      if (DEBUG_INCOMING_PACKET_DATA) {
        logger.info(`receive video: num_nal_units=${nalUnits.length} pts=${pts}`);
      }
      if (config.enableRTSP) {
        // rtspServer will parse nalUnits and updates SPS/PPS for the stream,
        // so we don't need to parse them here.
        // TODO: Should SPS/PPS be parsed here?
        this.rtspServer.sendVideoData(stream, nalUnits, pts, dts);
      }
      if (config.enableRTMP || config.enableRTMPT) {
        this.rtmpServer.sendVideoPacket(stream, nalUnits, pts, dts);
      }
      hasVideoFrame = false;
      for (j = 0, len = nalUnits.length; j < len; j++) {
        nalUnit = nalUnits[j];
        nalUnitType = h264.getNALUnitType(nalUnit);
        if (nalUnitType === h264.NAL_UNIT_TYPE_SPS) { // 7
          stream.updateSPS(nalUnit);
        } else if (nalUnitType === h264.NAL_UNIT_TYPE_PPS) { // 8
          stream.updatePPS(nalUnit);
        } else if ((nalUnitType === h264.NAL_UNIT_TYPE_IDR_PICTURE) || (nalUnitType === h264.NAL_UNIT_TYPE_NON_IDR_PICTURE)) { // 5 (key frame) or 1 (inter frame)
          hasVideoFrame = true;
        }
        if (DEBUG_INCOMING_PACKET_HASH) {
          md5 = crypto.createHash('md5');
          md5.update(nalUnit);
          tsDiff = pts - stream.lastSentVideoTimestamp;
          logger.info(`video: pts=${pts} pts_diff=${tsDiff} md5=${(md5.digest('hex').slice(0, 7))} nal_unit_type=${nalUnitType} bytes=${nalUnit.length}`);
          stream.lastSentVideoTimestamp = pts;
        }
      }
      if (hasVideoFrame) {
        stream.calcFrameRate(pts);
      }
    }

    // Takes H.264 NAL units separated by start code (0x000001)

    // arguments:
    //   nalUnit: Buffer
    //   pts: timestamp in 90 kHz clock rate (PTS)
    onReceiveVideoPacket(stream, nalUnitGlob, pts, dts) {
      var nalUnits;
      nalUnits = h264.splitIntoNALUnits(nalUnitGlob);
      if (nalUnits.length === 0) {
        return;
      }
      this.onReceiveVideoNALUnits(stream, nalUnits, pts, dts);
    }

    // pts, dts: in 90KHz clock rate
    onReceiveAudioAccessUnits(stream, accessUnits, pts, dts) {
      var accessUnit, i, j, len, md5, ptsPerFrame;
      if (config.enableRTSP) {
        this.rtspServer.sendAudioData(stream, accessUnits, pts, dts);
      }
      if (DEBUG_INCOMING_PACKET_DATA) {
        logger.info(`receive audio: num_access_units=${accessUnits.length} pts=${pts}`);
      }
      ptsPerFrame = 90000 / (stream.audioSampleRate / 1024);
      for (i = j = 0, len = accessUnits.length; j < len; i = ++j) {
        accessUnit = accessUnits[i];
        if (DEBUG_INCOMING_PACKET_HASH) {
          md5 = crypto.createHash('md5');
          md5.update(accessUnit);
          logger.info(`audio: pts=${pts} md5=${(md5.digest('hex').slice(0, 7))} bytes=${accessUnit.length}`);
        }
        if (config.enableRTMP || config.enableRTMPT) {
          this.rtmpServer.sendAudioPacket(stream, accessUnit, Math.round(pts + ptsPerFrame * i), Math.round(dts + ptsPerFrame * i));
        }
      }
    }

    // pts, dts: in 90KHz clock rate
    onReceiveAudioPacket(stream, adtsFrameGlob, pts, dts) {
      var adtsFrame, adtsFrames, adtsInfo, i, isConfigUpdated, j, len, rawDataBlock, rawDataBlocks, rtpTimePerFrame;
      adtsFrames = aac.splitIntoADTSFrames(adtsFrameGlob);
      if (adtsFrames.length === 0) {
        return;
      }
      adtsInfo = aac.parseADTSFrame(adtsFrames[0]);
      isConfigUpdated = false;
      stream.updateConfig({
        audioSampleRate: adtsInfo.sampleRate,
        audioClockRate: adtsInfo.sampleRate,
        audioChannels: adtsInfo.channels,
        audioObjectType: adtsInfo.audioObjectType
      });
      rtpTimePerFrame = 1024;
      rawDataBlocks = [];
      for (i = j = 0, len = adtsFrames.length; j < len; i = ++j) {
        adtsFrame = adtsFrames[i];
        rawDataBlock = adtsFrame.slice(7);
        rawDataBlocks.push(rawDataBlock);
      }
      return this.onReceiveAudioAccessUnits(stream, rawDataBlocks, pts, dts);
    }

  };

  module.exports = StreamServer;

}).call(this);
