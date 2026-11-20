module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method === "GET") return res.status(200).json({ status: "Throne AI Online" });

  const groq = async (messages, model = "llama-3.3-70b-versatile", temperature = 0.7) => {
    if (!process.env.GROQ_API_KEY) throw new Error("No Groq Key");
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.GROQ_API_KEY.trim()
      },
      body: JSON.stringify({ model, messages, temperature, stream: false })
    });
    if (!r.ok) throw new Error("Groq " + r.status);
    const d = await r.json();
    const out = d?.choices?.[0]?.message?.content?.trim();
    if (!out) throw new Error("Empty Groq");
    return out;
  };

  const gemini = async (prompt) => {
    if (!process.env.GEMINI_API_KEY) throw new Error("No Gemini Key");
    for (const m of ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"]) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY.trim()
        },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
      });
      if (r.ok) {
        const d = await r.json();
        const out = d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (out) return out;
      }
    }
    throw new Error("Gemini failed");
  };

  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const mode = b.mode || "chat";

    // 1. LIVE AI vs AI DEBATE ARENA
    if (mode === "debate") {
      const topic = String(b.topic || "").trim();
      const p1 = `You are "Throne Bolt" (Fighter 1). Argue strongly FOR the first/bold side in 3 punchy bullet points in the exact language of the topic.\nTopic: ${topic}`;
      const p2 = `You are "Throne Nova" (Fighter 2). Argue strongly for the OPPOSITE side, exposing flaws in 3 punchy bullet points in the exact language of the topic.\nTopic: ${topic}`;

      const [r1, r2] = await Promise.allSettled([
        groq([{ role: "user", content: p1 }], "llama-3.3-70b-versatile", 0.8),
        gemini(p2)
      ]);

      const fighter1 = r1.status === "fulfilled" ? r1.value : await gemini(p1).catch(() => "Fighter 1 busy");
      const fighter2 = r2.status === "fulfilled" ? r2.value : await groq([{ role: "user", content: p2 }], "llama-3.1-8b-instant", 0.8).catch(() => "Fighter 2 busy");

      const vp = `Neutral judge: Give a crisp 2-line final verdict in the same language as the topic.\nTopic: ${topic}\nA: ${fighter1}\nB: ${fighter2}`;
      const verdict = await groq([{ role: "user", content: vp }], "llama-3.1-8b-instant", 0.4)
        .catch(() => gemini(vp))
        .catch(() => "Dono sides strong hain — apni zaroorat ke hisab se chuno.");

      return res.status(200).json({ fighter1, fighter2, verdict, engine: "dual-arena" });
    }

    // 2. SMART 8K IMAGE PROMPT ENHANCER
    if (mode === "enhance_image") {
      const raw = String(b.prompt || "").trim();
      const style = String(b.style || "Cinematic Ultra HD").trim();
      const ep = `Convert this idea (Hindi/Hinglish/English) into ONE rich English image prompt in "${style}" style with lighting & camera details. Output ONLY the prompt (max 45 words).\nIdea: ${raw}`;
      const enhancedPrompt = await groq([{ role: "user", content: ep }], "llama-3.1-8b-instant", 0.6)
        .catch(() => gemini(ep))
        .catch(() => `${raw}, ${style}, 8k ultra detailed`);
      return res.status(200).json({ enhancedPrompt });
    }

    // 3. ULTRA-FAST CHAT & CODING (GROQ -> GEMINI)
    const msgs = Array.isArray(b.messages) ? b.messages : [];
    try {
      const reply = await groq(msgs, b.model || "llama-3.3-70b-versatile", b.temperature ?? 0.7);
      return res.status(200).json({ reply, engine: "groq-turbo" });
    } catch (e) {}

    const prompt = msgs.map(m => `${m.role}: ${m.content}`).join("\n\n");
    const reply = await gemini(prompt);
    return res.status(200).json({ reply, engine: "gemini-flash" });

  } catch (err) {
    return res.status(502).json({ error: err.message || "Engine busy" });
  }
};
        
