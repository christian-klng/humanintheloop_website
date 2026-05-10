const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function callOpenRouter(messages, model, apiKey) {
    const resp = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': process.env.BASE_URL || 'https://humanintheloop.academy'
        },
        body: JSON.stringify({ model, messages }),
        signal: AbortSignal.timeout(60000)
    });

    if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        if (resp.status === 401) throw new Error('Ungültiger API-Schlüssel');
        if (resp.status === 429) throw new Error('Rate-Limit erreicht. Bitte später erneut versuchen.');
        throw new Error(`OpenRouter-Fehler (${resp.status}): ${body.slice(0, 200)}`);
    }

    const data = await resp.json();
    if (!data.choices || !data.choices[0]) {
        throw new Error('Keine Antwort vom LLM erhalten');
    }
    return data.choices[0].message.content;
}

async function generateTestCase(prompt, systemPrompt, model, apiKey) {
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    return callOpenRouter(messages, model, apiKey);
}

async function evaluateTestCase(testCaseMd, criteriaJson, model, apiKey) {
    const criteriaList = Array.isArray(criteriaJson) ? criteriaJson : criteriaJson.criteria || [];

    const systemPrompt = `Du bist ein Evaluator. Bewerte den folgenden Testfall anhand der gegebenen Kriterien.
Für jedes Kriterium vergib einen Score von 1-10 und schreibe einen kurzen Kommentar (1 Satz).
Antworte ausschließlich als JSON-Array in diesem Format:
[{"criterion": "Name des Kriteriums", "score": 8, "comment": "Kurze Begründung"}]`;

    const userPrompt = `## Kriterien
${JSON.stringify(criteriaList, null, 2)}

## Testfall
${testCaseMd}`;

    const response = await callOpenRouter(
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        model,
        apiKey
    );

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
        throw new Error('LLM-Antwort enthält kein gültiges JSON');
    }

    return JSON.parse(jsonMatch[0]);
}

module.exports = { generateTestCase, evaluateTestCase };
