const isHttpsEnabled = ['1', 'true', 'yes'].includes(String(process.env.USE_HTTPS || '').trim().toLowerCase());
const httpScheme = isHttpsEnabled ? 'https' : 'http';
const wsScheme = isHttpsEnabled ? 'wss' : 'ws';

const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'FileTransfer API',
    version: '1.0.0',
    description: '演出中台后端接口文档，覆盖文件上传、节目单、AI 口播、实时播控、WebSocket 协议与设置相关接口。'
  },
  servers: [
    {
      url: `${httpScheme}://localhost:3000`,
      description: '本地开发环境'
    }
  ],
  tags: [
    { name: 'Files', description: '文件上传与文件列表' },
    { name: 'Music', description: '节目单与音频播放相关接口' },
    { name: 'Shows', description: '当前演出与节目状态' },
    { name: 'AI', description: 'AI 口播与文本纠错' },
    { name: 'Settings', description: '用户设置' },
    { name: 'Live', description: '实时播控与摄像头画面' },
    { name: 'WebSocket', description: '实时消息与音量监控命令' },
    { name: 'Mobile', description: '手机控制与扫码页面' },
    { name: 'Diagnostics', description: '前端错误回传' }
  ],
  'x-websocket': {
    endpoint: `${wsScheme}://localhost:3000/ws/{client-type}`,
    description: 'WebSocket 连接路径即客户端类型，例如 recording、volume-:2。连接成功后服务端会先下发 clientId。',
    clientToServer: [
      {
        type: 'identify',
        description: '显式设置客户端类型，等同于连接路径类型。',
        data: { clientType: 'recording' }
      },
      {
        type: 'subscribe-volume',
        description: '订阅某个录音文件的音量监控，并触发服务端启动音量采集。',
        data: { fileName: 'recording-2026-03-28T11-00-00-000Z.flac', device: ':2' }
      },
      {
        type: 'add-chunk',
        description: '上传录音分块，当前主要用于旧录音链路兼容。',
        data: { fileName: 'recording-2026-03-28T11-00-00-000Z.flac', chunkBase64: '...' }
      },
      {
        type: 'get-status',
        description: '查询某个录音任务的状态。',
        data: { fileName: 'recording-2026-03-28T11-00-00-000Z.flac' }
      },
      {
        type: 'echo',
        description: '调试命令，服务端会原样回显 data。',
        data: { hello: 'world' }
      },
      {
        type: 'raw',
        description: '调试命令，和 echo 一样走回显逻辑。',
        data: { hello: 'world' }
      }
    ],
    serverToClient: [
      { type: 'clientId', description: '连接建立后下发的客户端标识。', data: 1 },
      { type: 'identify-result', description: 'identify 命令结果。', success: true },
      { type: 'subscribe-volume-result', description: 'subscribe-volume 命令结果。', success: true, fileName: 'recording-2026-03-28T11-00-00-000Z.flac' },
      { type: 'monitor-start', description: '音量监控启动结果。', data: { success: true } },
      { type: 'add-chunk-result', description: 'add-chunk 命令结果。', success: true },
      { type: 'get-status-result', description: 'get-status 命令结果。', success: true, data: { type: 'object' } },
      { type: 'echo', description: 'echo/raw 的回显消息。', success: true, data: { hello: 'world' } },
      { type: 'live-push-event', description: '手机端推流事件通知。', data: { event: 'producer-created', sessionId: '...', producerId: '...', kind: 'video', timestamp: 1679999940000 } },
      { type: 'volume', description: '音量推送事件，通常是 0-100 的整数。', data: { fileName: 'recording-2026-03-28T11-00-00-000Z.flac', volume: 42, timestamp: 1679999940000 } }
    ]
  },
  components: {
    schemas: {
      SuccessFlag: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true }
        }
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: '请求失败' }
        }
      },
      UploadedFile: {
        type: 'object',
        properties: {
          name: { type: 'string', example: '节目伴奏.mp3' },
          savedName: { type: 'string', example: '1710000000000-123456789-节目伴奏.mp3' },
          size: { type: 'integer', example: 2048000 },
          path: { type: 'string', example: '/Users/demo/FileTransfer/uploads/1710000000000-123456789-节目伴奏.mp3' },
          uploadTime: { type: 'string', format: 'date-time' }
        }
      },
      Track: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '1710000000000-demo-track' },
          performer: { type: 'string', example: '高一(2)班' },
          programName: { type: 'string', example: '青春舞曲' },
          hostScript: { type: 'string', example: '下面请欣赏由高一(2)班带来的《青春舞曲》。' },
          fileName: { type: 'string', example: '青春舞曲.mp3' },
          displayName: { type: 'string', example: '青春舞曲.mp3' },
          savedName: { type: 'string', example: '1710000000000-123456789-青春舞曲.mp3' },
          size: { type: 'integer', example: 3456789 },
          uploadTime: { type: 'string', format: 'date-time' },
          order: { type: 'integer', example: 1 },
          playUrl: { type: 'string', example: '/v1/music/file/MTcxMDAwMDAwMDAwMC0xMjM0NTY3ODkt6Z2S5pil6Iie5puyLm1wMw' }
        }
      },
      MusicListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          generatedAt: { type: 'string', format: 'date-time' },
          recordName: { type: 'string', example: '春季汇演' },
          count: { type: 'integer', example: 2 },
          musicList: {
            type: 'array',
            items: { $ref: '#/components/schemas/Track' }
          }
        }
      },
      CurrentShow: {
        type: 'object',
        properties: {
          fileName: { type: 'string', example: '春季汇演.json' },
          recordName: { type: 'string', example: '春季汇演' },
          currentProgramName: { type: 'string', example: '青春舞曲' },
          currentPerformerName: { type: 'string', example: '高一(2)班' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      CurrentProgram: {
        type: 'object',
        properties: {
          performer: { type: 'string', example: '高一(2)班' },
          programName: { type: 'string', example: '青春舞曲' }
        }
      },
      ShowRecord: {
        type: 'object',
        properties: {
          fileName: { type: 'string', example: '春季汇演.json' },
          recordName: { type: 'string', example: '春季汇演' },
          count: { type: 'integer', example: 12 },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      Settings: {
        type: 'object',
        properties: {
          profile: {
            type: 'object',
            properties: {
              displayName: { type: 'string' },
              avatarUrl: { type: 'string' },
              phone: { type: 'string' },
              email: { type: 'string' }
            }
          },
          preferences: {
            type: 'object',
            properties: {
              theme: { type: 'string', example: 'light' },
              fontScale: { type: 'integer', example: 100 },
              autoPlay: { type: 'boolean', example: true },
              marqueeSpeed: { type: 'integer', example: 16 }
            }
          },
          speech: {
            type: 'object',
            properties: {
              mode: { type: 'string', example: 'ai' },
              language: { type: 'string', example: 'zh-CN' },
              offlineFallback: { type: 'boolean', example: true }
            }
          },
          ai: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean', example: true },
              showModelHint: { type: 'boolean', example: true }
            }
          },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      LiveState: {
        type: 'object',
        properties: {
          playbackCommandId: { type: 'integer', example: 3 },
          playbackAction: { type: 'string', example: 'play' },
          effectCommandId: { type: 'integer', example: 5 },
          effectName: { type: 'string', example: 'applause' },
          updatedAt: { type: 'string', format: 'date-time' },
          backendPlayback: { $ref: '#/components/schemas/BackendPlaybackState' }
        }
      },
      BackendPlaybackState: {
        type: 'object',
        properties: {
          available: { type: 'boolean', example: true },
          driver: { type: 'string', example: 'afplay' },
          canPause: { type: 'boolean', example: true },
          state: { type: 'string', example: 'playing' },
          errorMessage: { type: 'string', example: '' },
          currentTrack: {
            anyOf: [
              { $ref: '#/components/schemas/Track' },
              { type: 'null' }
            ]
          },
          progress: { $ref: '#/components/schemas/BackendPlaybackProgress' },
          updatedAt: { type: 'string', format: 'date-time', nullable: true }
        }
      },
      BackendPlaybackProgress: {
        type: 'object',
        properties: {
          isAvailable: { type: 'boolean', example: true },
          positionSec: { type: 'number', example: 12.345 },
          durationSec: { type: 'number', example: 218.274, nullable: true },
          progressPercent: { type: 'number', example: 5.66 },
          startedAt: { type: 'string', format: 'date-time', nullable: true },
          pausedAt: { type: 'string', format: 'date-time', nullable: true },
          updatedAt: { type: 'string', format: 'date-time', nullable: true }
        }
      }
      ,
        RecordingInfo: {
          type: 'object',
          properties: {
            fileName: { type: 'string', example: 'recording-2026-03-28T11-00-00-000Z.flac' },
            startTime: { type: 'string', format: 'date-time' }
          }
        },
        VolumeEvent: {
          type: 'object',
          properties: {
            fileName: { type: 'string', example: 'recording-2026-03-28T11-00-00-000Z.flac' },
            volume: { type: 'integer', example: 42 },
            timestamp: { type: 'integer', example: 1679999940000 }
          }
        },
        RecordingListItem: {
          type: 'object',
          properties: {
            filename: { type: 'string', example: 'recording-2026-03-28T11-00-00-000Z.flac' },
            size: { type: 'integer', example: 12345678 },
            createdAt: { type: 'string', format: 'date-time' },
            url: { type: 'string', example: '/v1/recordings/recording-2026-03-28T11-00-00-000Z.flac' }
          }
        },
        RecordingListResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/RecordingListItem' }
            }
          }
        },
        DeviceListResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            platform: { type: 'string', example: 'darwin' },
            raw: { type: 'string', example: 'AVFoundation audio devices:' }
          }
        },
        SwitchOutputDeviceRequest: {
          type: 'object',
          required: ['device'],
          properties: {
            device: { type: 'string', example: 'BlackHole 2ch' }
          }
        },
        SwitchOutputDeviceResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: true },
                platform: { type: 'string', example: 'darwin' },
                device: { type: 'string', example: 'BlackHole 2ch' },
                stdout: { type: 'string', example: '' },
                stderr: { type: 'string', example: '' }
              }
            }
          }
        },
        ConversionJobRequest: {
          type: 'object',
          properties: {
            fileName: { type: 'string', example: 'recording-2026-03-28T11-00-00-000Z.flac' },
            inputUrl: { type: 'string', example: 'https://example.com/input.mp3' },
            outFileName: { type: 'string', example: 'output.mp3' },
            ffmpegArgs: {
              type: 'array',
              items: { type: 'string' },
              example: ['-i', 'input.mp3', '-c:a', 'aac', '-b:a', '128k']
            }
          }
        },
        ConversionJobResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            jobId: { type: 'integer', example: 12 }
          }
        },
        ConversionJob: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 12 },
            status: { type: 'string', example: 'queued' },
            createdAt: { type: 'integer', example: 1679999940000 },
            startedAt: { type: 'integer', nullable: true, example: 1679999941000 },
            completedAt: { type: 'integer', nullable: true, example: 1679999950000 },
            cancelledAt: { type: 'integer', nullable: true, example: 1679999945000 },
            progress: { type: 'number', nullable: true, example: 42.5 },
            result: { type: 'object', nullable: true },
            error: { type: 'string', nullable: true },
            stderr: { type: 'string', nullable: true }
          }
        },
        WebSocketCommand: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['identify', 'subscribe-volume', 'add-chunk', 'get-status', 'echo', 'raw']
            },
            data: {
              oneOf: [
                { type: 'object' },
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
                { type: 'null' }
              ]
            }
          }
        },
        WebSocketEvent: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['clientId', 'identify-result', 'subscribe-volume-result', 'monitor-start', 'add-chunk-result', 'get-status-result', 'echo', 'volume', 'live-push-event']
            },
            success: { type: 'boolean', nullable: true },
            fileName: { type: 'string', nullable: true },
            data: {
              oneOf: [
                { type: 'object' },
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
                { type: 'null' }
              ]
            }
          }
        }
    }
  },
  paths: {
    '/v1/upload': {
      post: {
        tags: ['Files'],
        summary: '上传单个文件',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '上传成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: '文件上传成功' },
                    fileInfo: { $ref: '#/components/schemas/UploadedFile' }
                  }
                }
              }
            }
          },
          400: {
            description: '缺少文件',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    },
    '/v1/files': {
      get: {
        tags: ['Files'],
        summary: '获取上传文件列表',
        responses: {
          200: {
            description: '读取成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    files: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/UploadedFile' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/music/musiclist': {
      get: {
        tags: ['Music'],
        summary: '获取当前节目单',
        responses: {
          200: {
            description: '节目单读取成功',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MusicListResponse' }
              }
            }
          }
        }
      }
    },
    '/v1/music/musiclist/runtime-track': {
      post: {
        tags: ['Music'],
        summary: '新增临时节目到节目单',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['performer', 'programName'],
                properties: {
                  performer: { type: 'string', example: '张三' },
                  programName: { type: 'string', example: '独唱《最初的梦想》' },
                  hostScript: { type: 'string', example: '感谢大家的到来。' },
                  sourceTrack: { $ref: '#/components/schemas/Track' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '新增成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: '节目已加入临时列表' },
                    track: { $ref: '#/components/schemas/Track' },
                    musicList: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Track' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/music/musiclist/save': {
      post: {
        tags: ['Music'],
        summary: '保存节目单或演出记录',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['recordName', 'musicList'],
                properties: {
                  recordName: { type: 'string', example: '春季汇演' },
                  setCurrent: { type: 'boolean', example: true },
                  musicList: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Track' }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '保存成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: '演出保存成功，并已设为当前演出' },
                    fileName: { type: 'string', example: '春季汇演.json' },
                    currentShow: {
                      anyOf: [
                        { $ref: '#/components/schemas/CurrentShow' },
                        { type: 'null' }
                      ]
                    },
                    filePath: { type: 'string', example: '/v1/show_record/%E6%98%A5%E5%AD%A3%E6%B1%87%E6%BC%94.json' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/music/file/{token}': {
      get: {
        tags: ['Music'],
        summary: '按 token 获取音频文件流',
        parameters: [
          {
            name: 'token',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: '由 /v1/music/file-url 或节目单中的 playUrl 生成的音频标识'
          }
        ],
        responses: {
          200: {
            description: '音频文件内容',
            content: {
              'audio/mpeg': {
                schema: { type: 'string', format: 'binary' }
              },
              'application/octet-stream': {
                schema: { type: 'string', format: 'binary' }
              }
            }
          },
          404: {
            description: '音频文件不存在',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    },
    '/v1/music/file-url': {
      post: {
        tags: ['Music'],
        summary: '根据文件名换取可播放地址',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['fileName'],
                properties: {
                  fileName: { type: 'string', example: '1710000000000-123456789-青春舞曲.mp3' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '获取成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    fileName: { type: 'string', example: '青春舞曲.mp3' },
                    savedName: { type: 'string', example: '1710000000000-123456789-青春舞曲.mp3' },
                    url: { type: 'string', example: '/v1/music/file/MTcxMDAwMDAwMDAwMC0xMjM0NTY3ODkt6Z2S5pil6Iie5puyLm1wMw' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/music/preview-source': {
      post: {
        tags: ['Music'],
        summary: '获取预听工具使用的音频地址和文件路径',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['fileName'],
                properties: {
                  fileName: { type: 'string', example: '1710000000000-123456789-青春舞曲.mp3' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '获取成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    fileName: { type: 'string', example: '青春舞曲.mp3' },
                    savedName: { type: 'string', example: '1710000000000-123456789-青春舞曲.mp3' },
                    filePath: { type: 'string', example: '/Users/demo/FileTransfer/uploads/1710000000000-123456789-青春舞曲.mp3' },
                    url: { type: 'string', example: '/v1/music/file/MTcxMDAwMDAwMDAwMC0xMjM0NTY3ODkt6Z2S5pil6Iie5puyLm1wMw' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/recording/start-recording-backend': {
      post: {
        tags: ['Live'],
        summary: '后端启动 ffmpeg 录音（可传 device 或 自定义 ffmpegArgs）',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  clientId: { type: 'string', example: '1' },
                  device: { type: 'string', example: ':2', description: '平台依赖的设备标识，macOS avfoundation 使用 :<index>' },
                  outFileName: { type: 'string', example: 'myrecord.flac' },
                  ffmpegArgs: { type: 'array', items: { type: 'string' }, description: '如需自定义完整 ffmpeg 参数，可传数组' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '后端 ffmpeg 已启动，返回文件名',
            content: {
              'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/RecordingInfo' } } } }
            }
          },
          400: { description: '请求参数错误', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          500: { description: '启动失败', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
      }
    },
    '/v1/recording/stop-recording-backend': {
      post: {
        tags: ['Live'],
        summary: '停止后端录音（停止 ffmpeg 或 将内存 chunk 写盘）',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { type: 'object', required: ['fileName'], properties: { fileName: { type: 'string' } } } }
          }
        },
        responses: {
          200: { description: '停止成功', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessFlag' } } } },
          400: { description: '参数缺失', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          500: { description: '停止失败', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
      }
    },
    '/v1/recording/start-live-mic-playback': {
      post: {
        tags: ['Live'],
        summary: '启动 macOS 实时监听（麦克风直出系统扬声器）',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  device: { type: 'string', example: ':2', description: 'macOS avfoundation 输入设备索引或设备名' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '实时监听启动成功',
            content: {
              'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object' } } } }
            }
          },
          400: { description: '启动失败', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          500: { description: '启动失败', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
      }
    },
    '/v1/recording/stop-live-mic-playback': {
      post: {
        tags: ['Live'],
        summary: '停止 macOS 实时监听',
        responses: {
          200: { description: '停止成功', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessFlag' } } } },
          400: { description: '停止失败', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          500: { description: '停止失败', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
      }
    },
    '/v1/recording/recording-status': {
      get: {
        tags: ['Live'],
        summary: '查询录音状态（含最新音量）',
        parameters: [
          { name: 'fileName', in: 'query', required: false, schema: { type: 'string' }, description: '不传返回所有活动录音' }
        ],
        responses: {
          200: { description: '状态信息', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object' } } } } } }
        }
      }
    },
    '/v1/recording/convert': {
      post: {
        tags: ['Live'],
        summary: '转码任务入列（待开发）',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ConversionJobRequest' }
            }
          }
        },
        responses: {
          200: {
            description: '任务已进入队列',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConversionJobResponse' }
              }
            }
          },
          400: { description: '参数缺失', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          500: { description: '入列失败', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
      }
    },
    '/v1/recording/jobs/{id}': {
      get: {
        tags: ['Live'],
        summary: '查询转码队列任务状态（待开发）',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: '任务 ID' }
        ],
        responses: {
          200: {
            description: '任务状态',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    job: { $ref: '#/components/schemas/ConversionJob' }
                  }
                }
              }
            }
          },
          404: { description: '任务不存在', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
      }
    },
    '/v1/recording/jobs/{id}/cancel': {
      post: {
        tags: ['Live'],
        summary: '取消转码队列任务（待开发）',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: '任务 ID' }
        ],
        responses: {
          200: { description: '取消成功', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessFlag' } } } },
          400: { description: '无法取消或任务已结束', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          500: { description: '取消失败', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
      }
    },
    '/v1/recording/list-recordings': {
      get: {
        tags: ['Live'],
        summary: '获取录音文件列表',
        responses: {
          200: {
            description: '读取成功',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RecordingListResponse' }
              }
            }
          }
        }
      }
    },
    '/v1/recording/list-input-devices': {
      get: {
        tags: ['Live'],
        summary: '列出可用输入音频设备',
        responses: {
          200: {
            description: '读取成功',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeviceListResponse' }
              }
            }
          }
        }
      }
    },
    '/v1/recording/list-output-devices': {
      get: {
        tags: ['Live'],
        summary: '列出可用输出音频设备',
        responses: {
          200: {
            description: '读取成功',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeviceListResponse' }
              }
            }
          }
        }
      }
    },
    '/v1/recording/switch-output-device': {
      post: {
        tags: ['Live'],
        summary: '切换系统输出设备',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SwitchOutputDeviceRequest' }
            }
          }
        },
        responses: {
          200: {
            description: '切换成功',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SwitchOutputDeviceResponse' }
              }
            }
          },
          400: {
            description: '参数错误或平台不支持',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          500: {
            description: '切换失败',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    },
    '/v1/recording/{filename}': {
      delete: {
        tags: ['Live'],
        summary: '删除录音文件',
        parameters: [
          { name: 'filename', in: 'path', required: true, schema: { type: 'string' }, description: '录音文件名' }
        ],
        responses: {
          200: { description: '删除成功', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessFlag' } } } },
          400: { description: '文件路径无效', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          500: { description: '删除失败', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
      }
    },
    '/v1/music/backend-state': {
      get: {
        tags: ['Music'],
        summary: '获取后端播放器状态',
        responses: {
          200: {
            description: '读取成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    state: { $ref: '#/components/schemas/BackendPlaybackState' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/music/backend-progress': {
      get: {
        tags: ['Music'],
        summary: '获取后端播放器实时进度',
        responses: {
          200: {
            description: '读取成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    state: {
                      type: 'object',
                      properties: {
                        playbackState: { type: 'string', example: 'playing' },
                        currentTrack: {
                          anyOf: [
                            { $ref: '#/components/schemas/Track' },
                            { type: 'null' }
                          ]
                        },
                        progress: { $ref: '#/components/schemas/BackendPlaybackProgress' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/music/backend-progress/stream': {
      get: {
        tags: ['Music'],
        summary: '通过 SSE 持续推送后端播放器状态与进度',
        responses: {
          200: {
            description: 'SSE 持续数据流',
            content: {
              'text/event-stream': {
                schema: { type: 'string' }
              }
            }
          }
        }
      }
    },
    '/v1/music/backend-play': {
      post: {
        tags: ['Music'],
        summary: '让后端开始播放指定音频',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['fileName'],
                properties: {
                  fileName: { type: 'string', example: '1710000000000-123456789-青春舞曲.mp3' },
                  trackId: { type: 'string', example: '1710000000000-demo-track' },
                  performer: { type: 'string', example: '高一(2)班' },
                  programName: { type: 'string', example: '青春舞曲' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '播放成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: '后端开始播放' },
                    state: { $ref: '#/components/schemas/BackendPlaybackState' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/music/backend-control': {
      post: {
        tags: ['Music'],
        summary: '控制后端播放器暂停、恢复或停止',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['action'],
                properties: {
                  action: {
                    type: 'string',
                    enum: ['pause', 'resume', 'stop'],
                    example: 'pause'
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '控制成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    state: { $ref: '#/components/schemas/BackendPlaybackState' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/show/current': {
      get: {
        tags: ['Shows'],
        summary: '获取当前演出',
        responses: {
          200: {
            description: '读取成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    hasCurrentShow: { type: 'boolean', example: true },
                    currentShow: {
                      anyOf: [
                        { $ref: '#/components/schemas/CurrentShow' },
                        { type: 'null' }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['Shows'],
        summary: '切换当前演出',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['fileName'],
                properties: {
                  fileName: { type: 'string', example: '春季汇演.json' },
                  clearCurrentProgram: { type: 'boolean', example: false }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '切换成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: '当前演出切换成功' },
                    currentShow: { $ref: '#/components/schemas/CurrentShow' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/show/current-program': {
      get: {
        tags: ['Shows'],
        summary: '获取当前节目',
        responses: {
          200: {
            description: '读取成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    hasCurrentProgram: { type: 'boolean', example: true },
                    currentProgram: {
                      anyOf: [
                        { $ref: '#/components/schemas/CurrentProgram' },
                        { type: 'null' }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['Shows'],
        summary: '更新当前节目',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['programName'],
                properties: {
                  performer: { type: 'string', example: '高一(2)班' },
                  programName: { type: 'string', example: '青春舞曲' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '更新成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: '当前节目更新成功' },
                    currentShow: { $ref: '#/components/schemas/CurrentShow' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/show/current-state': {
      get: {
        tags: ['Shows'],
        summary: '获取当前演出与当前节目组合状态',
        responses: {
          200: {
            description: '读取成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    hasCurrentShow: { type: 'boolean', example: true },
                    hasCurrentProgram: { type: 'boolean', example: true },
                    currentShow: {
                      anyOf: [
                        { $ref: '#/components/schemas/CurrentShow' },
                        { type: 'null' }
                      ]
                    },
                    currentProgram: {
                      anyOf: [
                        { $ref: '#/components/schemas/CurrentProgram' },
                        { type: 'null' }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/shows': {
      get: {
        tags: ['Shows'],
        summary: '获取已保存演出列表',
        responses: {
          200: {
            description: '读取成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    count: { type: 'integer', example: 2 },
                    shows: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/ShowRecord' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/music/musiclist/export-pdf': {
      post: {
        tags: ['Music'],
        summary: '导出节目单 PDF',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['musicList'],
                properties: {
                  recordName: { type: 'string', example: '春季汇演' },
                  musicList: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Track' }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'PDF 文件流',
            content: {
              'application/pdf': {
                schema: { type: 'string', format: 'binary' }
              }
            }
          }
        }
      }
    },
    '/v1/ai/host-script-suggestions': {
      post: {
        tags: ['AI'],
        summary: '生成主持人口播词候选',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['performer', 'programName'],
                properties: {
                  performer: { type: 'string', example: '高一(2)班' },
                  programName: { type: 'string', example: '青春舞曲' },
                  count: { type: 'integer', example: 3, minimum: 1, maximum: 5 }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '生成成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    count: { type: 'integer', example: 3 },
                    suggestions: {
                      type: 'array',
                      items: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/ai/speech-refine-text': {
      post: {
        tags: ['AI'],
        summary: '纠正语音识别文本',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['text'],
                properties: {
                  text: { type: 'string', example: '下免请新上高一二班带来青春五曲' },
                  field: { type: 'string', example: 'host-script' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '处理成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    text: { type: 'string', example: '下面请欣赏高一(2)班带来的《青春舞曲》' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/settings': {
      get: {
        tags: ['Settings'],
        summary: '读取用户设置',
        responses: {
          200: {
            description: '读取成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    settings: { $ref: '#/components/schemas/Settings' }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['Settings'],
        summary: '保存用户设置',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['settings'],
                properties: {
                  settings: { $ref: '#/components/schemas/Settings' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '保存成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: '设置保存成功' },
                    settings: { $ref: '#/components/schemas/Settings' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/live/state': {
      get: {
        tags: ['Live'],
        summary: '获取实时播控状态',
        responses: {
          200: {
            description: '读取成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    state: { $ref: '#/components/schemas/LiveState' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/live/playback': {
      post: {
        tags: ['Live'],
        summary: '发送播放或暂停命令',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['action'],
                properties: {
                  action: {
                    type: 'string',
                    enum: ['play', 'pause'],
                    example: 'play'
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '更新成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    state: { $ref: '#/components/schemas/LiveState' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/live/effect': {
      post: {
        tags: ['Live'],
        summary: '触发音效命令',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['effectName'],
                properties: {
                  effectName: { type: 'string', example: 'applause' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '更新成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    state: { $ref: '#/components/schemas/LiveState' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/mobile/camera': {
      get: {
        tags: ['Mobile'],
        summary: '手机摄像头采集页面',
        responses: {
          200: {
            description: 'HTML 页面',
            content: {
              'text/html': {
                schema: { type: 'string' }
              }
            }
          }
        }
      }
    },
    '/v1/mobile/control': {
      get: {
        tags: ['Mobile'],
        summary: '手机播控页面',
        responses: {
          200: {
            description: 'HTML 页面',
            content: {
              'text/html': {
                schema: { type: 'string' }
              }
            }
          }
        }
      }
    },
    '/v1/mobile/links': {
      get: {
        tags: ['Mobile'],
        summary: '获取手机页面访问链接和二维码',
        responses: {
          200: {
            description: '读取成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    baseUrl: { type: 'string', example: 'http://192.168.1.10:3000' },
                    links: {
                      type: 'object',
                      properties: {
                        camera: { type: 'string' },
                        control: { type: 'string' }
                      }
                    },
                    qrs: {
                      type: 'object',
                      properties: {
                        camera: { type: 'string', example: 'data:image/png;base64,...' },
                        control: { type: 'string', example: 'data:image/png;base64,...' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/client-error': {
      post: {
        tags: ['Diagnostics'],
        summary: '上报前端错误日志',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  source: { type: 'string', example: 'frontend' },
                  message: { type: 'string', example: 'TypeError: Cannot read properties of undefined' },
                  stack: { type: 'string' },
                  page: { type: 'string', example: '/page/music' },
                  timestamp: { type: 'string', format: 'date-time' },
                  meta: { type: 'object', additionalProperties: true }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '记录成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

module.exports = openApiSpec;