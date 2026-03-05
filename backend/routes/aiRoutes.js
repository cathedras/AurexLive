const express = require('express');

const router = express.Router();

function buildFallbackSuggestions(performer, programName, count = 3) {
  const safePerformer = performer || '演出团队';
  const safeProgramName = programName || '精彩节目';

  const templates = [
    `下面请欣赏由${safePerformer}带来的《${safeProgramName}》，掌声有请。`,
    `接下来登场的是${safePerformer}，他们将为我们呈现《${safeProgramName}》，请大家欢迎。`,
    `现在为大家带来节目《${safeProgramName}》，表演者是${safePerformer}，请欣赏。`,
    `让我们以热烈掌声欢迎${safePerformer}，为大家带来《${safeProgramName}》。`,
    `下一节目《${safeProgramName}》即将开始，表演者${safePerformer}已经准备就绪。`
  ];

  return templates.slice(0, Math.max(1, Math.min(5, count)));
}

async function generateByOpenAICompatibleApi({ performer, programName, count }) {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.AI_API_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.AI_API_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    return buildFallbackSuggestions(performer, programName, count);
  }

  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  const prompt = [
    '你是晚会主持人口播词助手。',
    `请基于以下信息生成${count}条不同风格的主持人口播词。`,
    `演出人：${performer || '未知演出人'}`,
    `节目名：${programName || '未命名节目'}`,
    '要求：每条不超过60字，语气自然，适合舞台报幕，只返回JSON数组字符串。'
  ].join('\n');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      messages: [
        { role: 'system', content: '你是专业中文主持稿助手。' },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`AI 接口调用失败（${response.status}）`);
  }

  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content || '[]';

  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || '').trim()).filter(Boolean).slice(0, count);
    }
  } catch {
    const lines = content
      .split('\n')
      .map((line) => line.replace(/^[-\d.\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, count);

    if (lines.length) {
      return lines;
    }
  }

  return buildFallbackSuggestions(performer, programName, count);
}

async function refineSpeechTextByOpenAICompatibleApi({ text, field }) {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.AI_API_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.AI_API_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    return text;
  }

  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const userPrompt = [
    '你是中文语音识别文本纠错助手。',
    `字段类型：${field || '通用'}`,
    `原始文本：${text}`,
    '请修正常见同音字与标点，不改变原意，不扩写，不解释，只输出最终文本。'
  ].join('\n');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: '你只返回纠错后的文本。' },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`AI 接口调用失败（${response.status}）`);
  }

  const result = await response.json();
  const content = String(result?.choices?.[0]?.message?.content || '').trim();
  return content || text;
}

router.post('/ai/host-script-suggestions', async (req, res) => {
  try {
    const performer = String(req.body?.performer || '').trim();
    const programName = String(req.body?.programName || '').trim();
    const count = Math.max(1, Math.min(5, Number(req.body?.count || 3)));

    if (!performer || !programName) {
      return res.status(400).json({
        success: false,
        message: '演出人和节目名不能为空'
      });
    }

    const suggestions = await generateByOpenAICompatibleApi({ performer, programName, count });

    return res.json({
      success: true,
      count: suggestions.length,
      suggestions
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `生成口播词失败：${error.message}`
    });
  }
});

router.post('/ai/speech-refine-text', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    const field = String(req.body?.field || 'general').trim();

    if (!text) {
      return res.status(400).json({
        success: false,
        message: '文本不能为空'
      });
    }

    const refinedText = await refineSpeechTextByOpenAICompatibleApi({ text, field });
    return res.json({
      success: true,
      text: refinedText
    });
  } catch {
    return res.json({
      success: true,
      text: String(req.body?.text || '').trim()
    });
  }
});

module.exports = router;
