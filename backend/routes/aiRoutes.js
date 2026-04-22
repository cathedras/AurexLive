const express = require('express');

const router = express.Router();

function buildFallbackSuggestions(performer, programName, count = 3) {
  const safePerformer = performer || 'The production team';
  const safeProgramName = programName || 'the next performance';

  const templates = [
    `Now please enjoy "${safeProgramName}" presented by ${safePerformer}. Let's give them a warm round of applause.`,
    `${safePerformer} will take the stage next with "${safeProgramName}". Please welcome them.`,
    `We are now bringing you "${safeProgramName}", performed by ${safePerformer}. Please enjoy the show.`,
    `Let's warmly welcome ${safePerformer} to present "${safeProgramName}".`,
    `The next performance, "${safeProgramName}", is about to begin. ${safePerformer} is ready to go.`
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
    'You are an assistant for event host announcement lines.',
    `Generate ${count} host announcement lines in different styles based on the following information.`,
    `Performer: ${performer || 'Unknown performer'}`,
    `Program: ${programName || 'Untitled program'}`,
    'Requirements: each line must be no more than 60 Chinese characters in the original design, use a natural tone suitable for stage announcements, and return only a JSON array string.'
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
        { role: 'system', content: 'You are a professional assistant for Chinese host scripts.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`AI API call failed (${response.status})`);
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
    'You are an assistant for correcting Chinese speech recognition text.',
    `Field type: ${field || 'general'}`,
    `Original text: ${text}`,
    'Please fix common homophones and punctuation without changing the original meaning, without expanding or explaining, and return only the final text.'
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
        { role: 'system', content: 'Return only the corrected text.' },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`AI API call failed (${response.status})`);
  }

  const result = await response.json();
  const content = String(result?.choices?.[0]?.message?.content || '').trim();
  return content || text;
}

router.post('/host-script-suggestions', async (req, res) => {
  try {
    const performer = String(req.body?.performer || '').trim();
    const programName = String(req.body?.programName || '').trim();
    const count = Math.max(1, Math.min(5, Number(req.body?.count || 3)));

    if (!performer || !programName) {
      return res.status(400).json({
        success: false,
        message: 'Performer and program name are required.'
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
      message: `Failed to generate host script lines: ${error.message}`
    });
  }
});

router.post('/speech-refine-text', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    const field = String(req.body?.field || 'general').trim();

    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'Text is required.'
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
