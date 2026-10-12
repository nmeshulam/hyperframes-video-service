import { skillLoaderService } from './skill-loader.service.js';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { FullTranscript, TranscriptWord } from '../types.js';
import { StoryPlan, StoryScene } from './story.service.js';

export interface SceneLayer {
  bgPath: string;
  fgPath: string;
  startTime: number;
  endTime: number;
  title: string;
  colorTheme: string;
  wordIds: string[];
}

export interface DimensionConfig {
  width: number;
  height: number;
  resolution: string;
  fontSize: number;
  maxLineWidth: number;
  badgeTop: number;
  isVertical: boolean;
}

export function resolveDimensions(aspectRatio: string = '16:9'): DimensionConfig {
  const norm = (aspectRatio || '').toLowerCase().replace('x', ':').trim();

  if (norm === '9:16' || norm === 'vertical' || norm === 'portrait' || norm === 'tiktok' || norm === 'shorts') {
    return {
      width: 1080,
      height: 1920,
      resolution: '1080x1920',
      fontSize: 58,
      maxLineWidth: 900,
      badgeTop: 140,
      isVertical: true
    };
  }

  if (norm === '1:1' || norm === 'square') {
    return {
      width: 1080,
      height: 1080,
      resolution: '1080x1080',
      fontSize: 64,
      maxLineWidth: 960,
      badgeTop: 80,
      isVertical: false
    };
  }

  // Default: 16:9 landscape (YouTube)
  return {
    width: 1920,
    height: 1080,
    resolution: '1920x1080',
    fontSize: 82,
    maxLineWidth: 1600,
    badgeTop: 60,
    isVertical: false
  };
}

export class CompositionService {
  private anthropic: Anthropic | null = null;

  constructor() {
    if (config.anthropicApiKey) {
      this.anthropic = new Anthropic({
        apiKey: config.anthropicApiKey
      });
      console.log(`[CompositionService] Anthropic Claude client initialized (${config.anthropicModel}).`);
    } else {
      console.log('[CompositionService] ANTHROPIC_API_KEY not set; deterministic kinetic generator will be used.');
    }
  }

  /**
   * Builds the HyperFrames index.html composition using Claude Sonnet 5.5,
   * giving Claude complete creative freedom to design the most impactful WOW kinetic effects.
   */
  public async generateCompositionHtml(
    transcript: FullTranscript,
    audioFilename: string,
    storyPlan: StoryPlan,
    scenes: SceneLayer[],
    preset: string = 'auto',
    trackName: string = 'Cinematic Song',
    aspectRatio: string = '16:9'
  ): Promise<string> {
    const totalDuration = transcript.words.length > 0
      ? Math.ceil(transcript.words[transcript.words.length - 1].end + 2.5)
      : 50;

    const dims = resolveDimensions(aspectRatio);

    if (this.anthropic) {
      try {
        console.log(`[CompositionService] Calling Claude API (${config.anthropicModel}) for ${dims.resolution} composition...`);

        // Build the creative prompt giving Claude full artistic freedom
        const prompt = `
You are a world-class motion designer and creative director for viral, high-end kinetic music videos.
Your job is to generate a complete, production-grade, self-contained index.html video composition powered by HyperFrames and GSAP.

======================================================
PROJECT & CANVAS SPECIFICATIONS
======================================================
Song Title: "${trackName}"
Audio Track: assets/audio/${audioFilename}
Duration: ${totalDuration} seconds (FPS: 30)
Canvas Resolution: ${dims.resolution} (${aspectRatio})
Canvas Dimensions: width=${dims.width}px, height=${dims.height}px

======================================================
STORY SCENES & VISUAL ASSETS
======================================================
The song has been directed into 3 consecutive narrative visual scenes:
${scenes.map((s, idx) => `
Scene ${idx + 1}: "${s.title}" (${s.startTime}s to ${s.endTime}s)
- Background Plate: ${s.bgPath}
- Foreground Cutout (Subject): ${s.fgPath}
- Mood / Color Theme: ${s.colorTheme}
- Lyric Word IDs in this scene: ${s.wordIds.length} words (${s.wordIds[0] || 'none'} to ${s.wordIds[s.wordIds.length - 1] || 'none'})
`).join('')}

======================================================
FULL SONG TRANSCRIPT (EXACT WORDS & WORD-LEVEL TIMESTAMPS)
======================================================
CRITICAL RULE: You MUST use ONLY the exact words from this transcript. Every word displayed MUST match the song text and timestamps. Zero hallucinated lyrics.

${JSON.stringify(transcript.words.map(w => ({ id: w.id, word: w.word, start: w.start, end: w.end })), null, 2)}

======================================================
DIRECTOR'S BRIEF: 2.5D MUSIC VIDEO KINETIC DESIGN
======================================================
You are the Creative Director and Lead Motion Designer for a viral music video. Your job is to transform this vocal track into an unforgettable, beat-synced visual experience.

------------------------------------------------------
1. CADENCE-DRIVEN TYPOGRAPHY (READING THE VOCAL RHYTHM)
------------------------------------------------------
Read the vocal cadence from the word timestamps to direct the layout:
- RAPID VOCAL FLOW (Words close together, <0.4s):
  The artist is singing/rapping continuously. GROUP these words into natural lyrical phrases (3 to 6 words). Present the phrase as a cohesive visual unit with fluid word-by-word highlights, glowing sweeps, or subtle rhythm pulses. NEVER flash single rapid words in the same position.
- HEAVY BEATS & EMPHATIC DROPS (Pauses or isolated words >0.7s):
  These are anchor moments! Give these words solitary, bold hero presentation (large scale, high-impact entrance).
- THE GOLDEN TIMELINE RULE (ZERO OVERLAPPING):
  When the singer finishes a phrase, that phrase MUST cleanly exit the screen before or precisely as the next phrase arrives. Under no circumstances should two phrases collide or remain visible at the same coordinates.

------------------------------------------------------
2. SCENE-BY-SCENE MOTION PERSONALITIES (VISUAL PROGRESSION)
------------------------------------------------------
A great music video EVOLVES visually across scenes. Do NOT repeat the exact same animation technique across the whole song! Give each of the 3 scenes a distinct visual signature matching its narrative atmosphere:

- SCENE 1 ("${scenes[0]?.title || 'The Genesis'}"):
  Atmosphere: ${scenes[0]?.colorTheme || 'Raw & Grounded'}.
  Motion Idea: E.g., Gritty, mechanical, rising typography from the dust, words anchoring low or subtly behind the subject's silhouette with steady, measured motion.

- SCENE 2 ("${scenes[1]?.title || 'The Vision'}"):
  Atmosphere: ${scenes[1]?.colorTheme || 'Atmospheric & Ethereal'}.
  Motion Idea: E.g., 3D floating depth, words drifting through ambient light flares, words emerging from behind the character's shoulders into negative space, liquid or glowing wave reveals.

- SCENE 3 ("${scenes[2]?.title || 'The Climax'}"):
  Atmosphere: ${scenes[2]?.colorTheme || 'Triumphant & Powerful'}.
  Motion Idea: E.g., High-octane foreground hero typography, explosive letter dispersion/shatter on the climax drop, elastic zoom punches, bold cinematic 3D perspective tilts.

Feel free to choose whatever motion techniques best serve each scene's mood—just ensure each scene feels fresh and visually distinct!

------------------------------------------------------
3. THE 2.5D STAGE SANDBOX (UNIVERSAL DEPTH STAGING)
------------------------------------------------------
For each scene, you have two visual planes:
- Background Plate (${scenes.map(s => s.bgPath).join(', ')}): The deep environmental world (sky, road, interior, horizon).
- Focal Hero Cutout (${scenes.map(s => s.fgPath).join(', ')}): The primary subject(s) in the scene with transparent alpha (can be human characters, a couple, a vehicle, an instrument, a creature, or sacred architecture).

Treat the canvas as a physical 3D stage with 3 strategic depth zones:
1. UPPER HEADROOM BILLBOARD (Layer 3, z-index: 3, BEHIND the hero subject):
   * The hero subject is grounded in the lower/mid region of the frame, leaving the upper 35-45% wide open!
   * Place large, cinematic typography in Layer 3 across this upper headroom. Because it sits high, 85-90% of the letterform is completely visible in the open background plate, while the top silhouette of the hero subject (head, shoulders, car roof, etc.) overlaps the lower edge of the letters. This creates the iconic 3D physical depth illusion (like a Vogue/Time magazine cover) with 100% legibility!
2. FOREGROUND HERO PUNCH (Layer 5, z-index: 7, IN FRONT of the hero subject):
   * High-voltage climax words slamming directly in front of the subject toward the camera lens.
3. DEPTH CROSSOVER & LATERAL FLANKING:
   * Words can emerge from behind the subject into the open left/right negative space, or zoom forward from the upper depth plane past the subject into the foreground.
4. CAMERA PARALLAX:
   * Add subtle cinematic camera breathing—slowly scaling the background plate (scale: 1.0 -> 1.08) and the hero cutout (scale: 1.0 -> 1.14) at slightly different rates to create intense 2.5D dimensional realism.

======================================================
TECHNICAL HYPERFRAMES CONTRACT
======================================================
1. Include required metadata:
   <meta name="hyperframes:version" content="0.8">
   <meta name="hyperframes:duration" content="${totalDuration}">
   <meta name="hyperframes:fps" content="30">
   <meta name="hyperframes:resolution" content="${dims.resolution}">
   <meta name="viewport" content="width=${dims.width}, height=${dims.height}, initial-scale=1.0">
2. Load GSAP 3: <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
3. CSS: html, body, and root stage MUST be exactly ${dims.width}px by ${dims.height}px with overflow: hidden.
4. GSAP Timeline MUST be registered deterministically:
   const tl = gsap.timeline({ paused: true });
   window.__timelines = window.__timelines || {};
   window.__timelines["main"] = tl;
   tl.seek(0);
   (Do NOT use tl.play() or Date.now() - HyperFrames seeks frame by frame).
5. Output ONLY the raw self-contained HTML document wrapped in \`\`\`html ... \`\`\`.
`;

        // Log the complete prompt sent to Claude
        console.log(`\n======================================================`);
        console.log(`🤖 [CompositionService] FULL PROMPT SENT TO CLAUDE (${config.anthropicModel}):`);
        console.log(`======================================================`);
        console.log(prompt);
        console.log(`======================================================\n`);

        const response = await (this.anthropic.messages.create as any)({
          model: config.anthropicModel,
          max_tokens: 16384,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'low' },
          system: skillLoaderService.getHyperframesSystemPrompt(),
          messages: [{ role: 'user', content: prompt }]
        });

        console.log("[CompositionService] Raw Response Blocks:", JSON.stringify((response.content || []).map((b: any) => ({ type: b.type, keys: Object.keys(b), length: (b.text || b.thinking || "").length }))));

        const textContent = (response.content || [])
          .filter((b: any) => b.type === "text" || b.text)
          .map((b: any) => b.text || "")
          .join("\n")
          .trim();

        console.log(`[CompositionService] Claude responded (${textContent.length} characters received).`);

        const htmlMatch = textContent.match(/```html([\s\S]*?)```/) || textContent.match(/<html[\s\S]*?<\/html>/i);
        if (htmlMatch) {
          const generatedHtml = htmlMatch[1] ? htmlMatch[1].trim() : htmlMatch[0].trim();
          if (transcript.words.length > 0 && generatedHtml.includes(transcript.words[0].word)) {
            console.log(`✓ [CompositionService] Claude custom WOW composition validated and accepted! (${generatedHtml.length} characters)`);
            console.log("---------------- GENERATED HTML GSAP CODE PREVIEW ----------------");
            const scriptMatch = generatedHtml.match(/<script[\s\S]*?<\/script>/i);
            if (scriptMatch) {
              console.log(scriptMatch[0].substring(0, 1500));
            }
            console.log("-------------------------------------------------------------------");
            return generatedHtml;
          } else {
            console.warn('[CompositionService] Claude output did not contain actual song words. Falling back to master composition.');
          }
        } else {
          console.warn('[CompositionService] Claude response did not contain clear HTML block. Falling back to master composition.');
        }
      } catch (err: any) {
        console.error(`[CompositionService] Claude API error: ${err.message}. Using master composition.`);
      }
    }

    return this.buildMasterStoryCompositionHtml(transcript, audioFilename, scenes, totalDuration, trackName, dims);
  }

  /**
   * Deterministic Master Composition Engine fallback ensuring complete lyrics accuracy
   * and 2.5D layer depth if the AI model is unavailable.
   */
  public buildMasterStoryCompositionHtml(
    transcript: FullTranscript,
    audioFilename: string,
    scenes: SceneLayer[],
    totalDuration: number,
    trackName: string,
    dims: DimensionConfig
  ): string {
    const { width, height, resolution, fontSize, maxLineWidth, badgeTop, isVertical } = dims;

    const scenesHtml = scenes.map((scene, i) => {
      const isFirst = i === 0;
      const sIdx = i + 1;
      const sceneWords = transcript.words.filter(w => scene.wordIds?.includes(w.id));

      const wordsHtml = sceneWords.map(w => `
        <span class="lyric-word" id="${w.id}">
          <span class="word-highlight-bg"></span>${w.word}
        </span>
      `).join('');

      return `
      <!-- Scene ${sIdx}: ${scene.title} (${scene.startTime}s - ${scene.endTime}s) -->
      <div id="scene-${sIdx}" class="scene-viewport" style="opacity: ${isFirst ? 1 : 0};">
        <img id="bg-scene-${sIdx}" class="bg-plate" src="${scene.bgPath}" alt="${scene.title}">
        <div id="aura-scene-${sIdx}" class="scene-aura aura-${scene.colorTheme || 'cyan'}"></div>
        <div class="depth-lyrics-container">
          <div id="line-scene-${sIdx}" class="lyric-line theme-${scene.colorTheme || 'cyan'}">
            ${wordsHtml}
          </div>
        </div>
        <img id="fg-scene-${sIdx}" class="fg-character" src="${scene.fgPath}" alt="Subject Cutout ${sIdx}">
        <div class="scene-badge">Scene ${sIdx} · ${scene.title}</div>
      </div>
      `;
    }).join('\n');

    const scenesJs = scenes.map((scene, i) => {
      const sIdx = i + 1;
      const start = scene.startTime;
      const end = scene.endTime;
      const duration = Math.max(1, end - start);

      let transitionCode = '';
      if (i > 0) {
        transitionCode = `
        tl.to("#scene-${i}", { opacity: 0, duration: 0.8, ease: "power2.inOut" }, ${Math.max(0, start - 0.4)});
        tl.to("#scene-${sIdx}", { opacity: 1, duration: 0.8, ease: "power2.inOut" }, ${Math.max(0, start - 0.4)});
        `;
      }

      return `
        // --- Scene ${sIdx} Animations (${start}s - ${end}s) ---
        ${transitionCode}
        tl.to("#bg-scene-${sIdx}", { scale: 1.12, x: -25, duration: ${duration}, ease: "sine.inOut" }, ${start});
        tl.to("#fg-scene-${sIdx}", { scale: 1.18, x: 20, duration: ${duration}, ease: "sine.inOut" }, ${start});
        tl.to("#aura-scene-${sIdx}", { scale: 1.25, opacity: 0.85, duration: ${Math.max(1, duration / 2)}, repeat: 1, yoyo: true, ease: "sine.inOut" }, ${start});

        tl.set("#line-scene-${sIdx}", { visibility: "visible" }, ${start + 0.1});
        tl.fromTo("#line-scene-${sIdx}", { opacity: 0, y: 35, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "power2.out" }, ${start + 0.1});
        tl.to("#line-scene-${sIdx}", { opacity: 0, y: -25, scale: 1.04, duration: 0.35, ease: "power2.in" }, ${Math.max(start + 0.5, end - 0.4)});
        tl.set("#line-scene-${sIdx}", { visibility: "hidden" }, ${end});
      `;
    }).join('\n');

    const wordsJs = transcript.words.map(w => `
        tl.to("#${w.id} .word-highlight-bg", { opacity: 1, scaleX: 1, duration: 0.12, ease: "power2.out" }, ${w.start});
        tl.to("#${w.id}", { color: "#ffffff", scale: 1.10, duration: 0.12, ease: "back.out(1.4)" }, ${w.start});
        tl.to("#${w.id}", { scale: 1.0, duration: 0.12, ease: "power1.out" }, ${w.start + 0.12});
        tl.to("#${w.id} .word-highlight-bg", { opacity: 0, duration: 0.22, ease: "power2.in" }, ${w.end});
        tl.to("#${w.id}", { color: "rgba(255, 255, 255, 0.45)", duration: 0.22 }, ${w.end});
        tl.set("#${w.id} .word-highlight-bg", { scaleX: 0 }, ${w.end + 0.22});
    `).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${width}, height=${height}, initial-scale=1.0">
  <meta name="hyperframes:version" content="0.8">
  <meta name="hyperframes:duration" content="${totalDuration}">
  <meta name="hyperframes:fps" content="30">
  <meta name="hyperframes:resolution" content="${resolution}">
  <title>${trackName} · Cinematic Story (${resolution})</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@800;900&family=Plus+Jakarta+Sans:wght@700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${width}px; height: ${height}px; overflow: hidden; background: #020617;
      font-family: "Montserrat", sans-serif; color: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    #stage { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; }

    .scene-viewport {
      position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden;
    }
    .bg-plate {
      position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
      transform-origin: center center; filter: brightness(0.68) contrast(1.15); z-index: 1;
    }
    .scene-aura {
      position: absolute; inset: 0; width: 100%; height: 100%; z-index: 2;
      opacity: 0.6; mix-blend-mode: screen; pointer-events: none;
    }
    .aura-cyan { background: radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.45) 0%, transparent 70%); }
    .aura-crimson { background: radial-gradient(circle at 50% 50%, rgba(251, 113, 133, 0.45) 0%, transparent 70%); }
    .aura-amber { background: radial-gradient(circle at 50% 50%, rgba(251, 191, 36, 0.45) 0%, transparent 70%); }
    .aura-purple { background: radial-gradient(circle at 50% 50%, rgba(192, 132, 252, 0.45) 0%, transparent 70%); }

    .depth-lyrics-container {
      position: absolute; inset: 0; z-index: 3; display: flex; align-items: center; justify-content: center;
      padding: ${isVertical ? '180px 40px 220px' : '0 120px'}; pointer-events: none;
    }
    .lyric-line {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
      gap: ${isVertical ? '12px 14px' : '16px 20px'}; text-align: center;
      max-width: ${maxLineWidth}px; opacity: 0; visibility: hidden;
    }
    .lyric-word {
      position: relative; isolation: isolate; font-family: "Montserrat", sans-serif;
      font-size: ${fontSize}px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.01em;
      color: rgba(255, 255, 255, 0.45); padding: 4px 14px 6px; border-radius: 12px;
      transform-origin: center center; text-shadow: 0 8px 30px rgba(0, 0, 0, 0.95);
    }
    .word-highlight-bg {
      position: absolute; inset: 0; border-radius: 10px; opacity: 0;
      transform: scaleX(0); transform-origin: left center; z-index: -1;
    }
    .theme-cyan .word-highlight-bg {
      background: linear-gradient(135deg, #38bdf8 0%, #0284c7 100%);
      box-shadow: 0 0 45px rgba(56, 189, 248, 0.8), 0 0 80px rgba(2, 132, 199, 0.5);
    }
    .theme-crimson .word-highlight-bg {
      background: linear-gradient(135deg, #fb7185 0%, #e11d48 100%);
      box-shadow: 0 0 45px rgba(251, 113, 133, 0.8), 0 0 80px rgba(225, 29, 72, 0.5);
    }
    .theme-amber .word-highlight-bg {
      background: linear-gradient(135deg, #fbbf24 0%, #d97706 100%);
      box-shadow: 0 0 45px rgba(251, 191, 36, 0.8), 0 0 80px rgba(217, 119, 6, 0.5);
    }

    .fg-character {
      position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
      transform-origin: center center; z-index: 5; pointer-events: none;
      filter: drop-shadow(0 15px 35px rgba(0, 0, 0, 0.85));
    }
    .scene-finisher {
      position: absolute; inset: 0;
      background: radial-gradient(circle at 50% 50%, transparent 55%, rgba(2, 6, 23, 0.85) 100%);
      z-index: 6; pointer-events: none;
    }
    .scene-badge {
      position: absolute; top: ${badgeTop}px; left: 50%; transform: translateX(-50%);
      font-family: "Plus Jakarta Sans", sans-serif; font-size: ${isVertical ? '14px' : '17px'};
      font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase;
      color: rgba(255, 255, 255, 0.8); padding: 8px 24px; border-radius: 9999px;
      background: rgba(0, 0, 0, 0.6); border: 1px solid rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(12px); z-index: 10;
    }

    audio { display: none; }
  </style>
</head>
<body>
  <div id="stage" data-composition-id="main">
    <audio id="soundtrack" src="assets/audio/${audioFilename}"></audio>
    ${scenesHtml}
    <div class="scene-finisher"></div>
  </div>

  <script>
    (function () {
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      ${scenesJs}
      ${wordsJs}
      window.__timelines["main"] = tl;
      tl.seek(0);
    })();
  </script>
</body>
</html>`;
  }
}

export const compositionService = new CompositionService();
