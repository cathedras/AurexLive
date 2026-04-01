const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'FileTransfer API',
    version: '1.0.0',
    description: '演出中台后端接口文档，覆盖文件上传、节目单、AI 口播、实时播控与设置相关接口。'
  },
  servers: [
    {
      url: 'http://localhost:3000',
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
    { name: 'Mobile', description: '手机控制与扫码页面' },
    { name: 'Diagnostics', description: '前端错误回传' }
  ],
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
          cameraUpdatedAt: { type: 'string', format: 'date-time', nullable: true },
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
    '/v1/musiclist': {
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
    '/v1/musiclist/save': {
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
    '/v1/start-recording': {
      post: {
        tags: ['Live'],
        summary: '开始本地内存记录（关联 clientId）',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['clientId'],
                properties: {
                  clientId: { type: 'string', example: '1' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '录音已开始（内存/分块模式）',
            content: {
              'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/RecordingInfo' } } } }
            }
          }
        }
      }
    },
    '/v1/start-recording-backend': {
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
    '/v1/stop-recording-backend': {
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
    '/v1/recording-status': {
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
    '/v1/recording-sse/{filename}': {
      get: {
        tags: ['Live'],
        summary: '通过 SSE 订阅指定录音的音量事件',
        parameters: [ { name: 'filename', in: 'path', required: true, schema: { type: 'string' } } ],
        responses: {
          200: { description: 'SSE 流（event: volume）', content: { 'text/event-stream': { schema: { type: 'string' } } } }
        }
      }
    },
    '/v1/ffmpeg-volume-sse': {
      get: {
        tags: ['Diagnostics'],
        summary: '基于 ffmpeg astats 实时输出音量（SSE）——用于调试或外部监控',
        parameters: [
          { name: 'fileName', in: 'query', required: false, schema: { type: 'string' }, description: '对已存在音频文件进行监控' },
          { name: 'device', in: 'query', required: false, schema: { type: 'string' }, description: '或传入设备标识以直接采集设备音频（平台依赖）' }
        ],
        responses: {
          200: { description: 'SSE 流（event: volume）', content: { 'text/event-stream': { schema: { type: 'string' } } } },
          400: { description: '缺少 fileName 或 device', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
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
    '/v1/musiclist/export-pdf': {
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
    '/v1/live/camera-frame': {
      get: {
        tags: ['Live'],
        summary: '获取最新摄像头画面',
        responses: {
          200: {
            description: '读取成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    hasFrame: { type: 'boolean', example: true },
                    imageData: { type: 'string', example: 'data:image/jpeg;base64,...' },
                    updatedAt: { type: 'string', format: 'date-time', nullable: true }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['Live'],
        summary: '上传最新摄像头画面',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['imageData'],
                properties: {
                  imageData: { type: 'string', example: 'data:image/jpeg;base64,...' }
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
                    updatedAt: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/v1/live/camera-stream': {
      get: {
        tags: ['Live'],
        summary: '获取 MJPEG 摄像头视频流',
        responses: {
          200: {
            description: 'MJPEG 视频流',
            content: {
              'multipart/x-mixed-replace': {
                schema: { type: 'string', format: 'binary' }
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