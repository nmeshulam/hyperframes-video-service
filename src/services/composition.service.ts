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
      fontSize: 64,
      maxLineWidth: 920,
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
Duration: ${totalDuration} seconds (FPS: 24)
Canvas Resolution: ${dims.resolution} (${aspectRatio})
Canvas Dimensions: width=${dims.width}px, height=${dims.height}px

======================================================
STORY SCENES & VISUAL ASSETS (THE EMOTIONAL ARC)
======================================================
The song has been directed into 3 consecutive narrative visual scenes with an evolving energy curve:
${scenes.map((s, idx) => {
  const energyProfiles = [
    { level: '4/10', role: 'EXPOSITION & ATMOSPHERIC SETUP', desc: 'Controlled, elegant, and grounded. Focus on spatial depth, ambient mood, and clean typographic framing.' },
    { level: '7/10', role: 'BUILD-UP & ESCALATING TENSION', desc: 'Accelerating tempo, fluid kinetic word flow, weaving through depth layers, snappier character staggers.' },
    { level: '10/10', role: 'SONG CLIMAX & VISUAL PEAK', desc: 'Maximum explosive impact! Staggered character explosions, scale punches, dynamic lighting pulses, camera shake on bass drops.' }
  ];
  const profile = energyProfiles[idx] || energyProfiles[2];
  return `
Scene ${idx + 1}: "${s.title}" (${s.startTime}s to ${s.endTime}s)
- Energy Arc: [Level ${profile.level} - ${profile.role}]
- Directional Focus: ${profile.desc}
- Background Plate: ${s.bgPath}
- Foreground Cutout (Subject): ${s.fgPath}
- Mood / Color Theme: ${s.colorTheme}
- Lyric Word IDs in this scene: ${s.wordIds.length} words (${s.wordIds[0] || 'none'} to ${s.wordIds[s.wordIds.length - 1] || 'none'})
`;
}).join('')}

======================================================
FULL SONG TRANSCRIPT (EXACT WORDS & WORD-LEVEL TIMESTAMPS)
======================================================
CRITICAL RULE: You MUST use ONLY the exact words from this transcript. Every word displayed MUST match the song text and timestamps. Zero hallucinated lyrics.

${JSON.stringify(transcript.words.map(w => ({ id: w.id, word: w.word, start: w.start, end: w.end })), null, 2)}

======================================================
DIRECTOR'S BRIEF: 2.5D MUSIC VIDEO KINETIC DESIGN
======================================================
You are the Creative Director and Lead Motion Designer for a viral, high-end music video. Your job is to transform this vocal track into an unforgettable, beat-synced visual experience.

------------------------------------------------------
1. CADENCE-DRIVEN TYPOGRAPHY & ZERO-OVERLAP RULE
------------------------------------------------------
Read the vocal cadence from the word timestamps to direct the layout:
- RAPID VOCAL FLOW (Words close together, <0.4s):
  GROUP these words into natural lyrical phrases (3 to 6 words). Present the phrase as a cohesive visual unit with fluid word-by-word highlights, glowing sweeps, or subtle rhythm pulses. NEVER flash single rapid words in the same position.
- HEAVY BEATS & EMPHATIC DROPS (Pauses or isolated words >0.7s):
  These are anchor moments! Give these words solitary, bold hero presentation (large scale, high-impact entrance).
- THE GOLDEN TIMELINE RULE (ZERO OVERLAPPING):
  When the singer finishes a phrase, that phrase MUST cleanly exit the screen before or precisely as the next phrase arrives. Under no circumstances should two phrases collide or remain visible at the same coordinates.

------------------------------------------------------
2. MOTION ARCHETYPE PALETTE (VARIETY IS MANDATORY)
------------------------------------------------------
A great music video EVOLVES visually across scenes. Do NOT repeat the exact same animation technique across the whole song!
You MUST assign a DIFFERENT Motion Archetype to each of the 3 scenes, matching the scene's emotional energy:

• ARCHETYPE A: EDITORIAL CHARACTER-STAGGER (Masked Baseline)
  - Implementation: Wrap words into individual character spans: <span class="char">W</span><span class="char">O</span><span class="char">R</span><span class="char">D</span> (styled with display: inline-block).
  - Motion: Characters rise up from an invisible baseline (y: 40px -> 0, opacity: 0 -> 1) with GSAP stagger: 0.025 and ease: "power3.out".
  - Feels: Luxury, high-fashion editorial, hyper-crisp typography.

• ARCHETYPE B: KINETIC IMPACT & SCALE-PUNCH (Beat-Drop Energy)
  - Implementation: For high-voltage emphatic words, slam into view from (scale: 1.5 -> 1.0, opacity: 0 -> 1) with punchy deceleration ease: "back.out(2)".
  - Micro-chromatic Kick: Brief RGB split or text-shadow shift (text-shadow: -5px 0 rgba(255,0,80,0.8), 5px 0 rgba(0,255,255,0.8)) for 0.12s upon entrance, snapping back to crisp solid white.
  - Feels: Punchy, aggressive, viral music video downbeat.

• ARCHETYPE C: 3D BILLBOARD & EXPANDING DRIFT (Stadium Cinematic Depth)
  - Implementation: Positioned in Layer 3 (Upper Headroom). The words breathe with expanding letter-spacing (letterSpacing: "4px" -> "14px") and subtle perspective drift (z: -40px -> 0).
  - Feels: Grand, stadium-scale, cinematic film title sequence.

• ARCHETYPE D: DIGITAL DISPERSE & SHATTER (Peak Glitch)
  - Implementation: For climax or rapid vocal peaks, characters shatter or scatter in random directions upon exit (x: "random(-60, 60)", y: "random(-40, 40)", rotation: "random(-15, 15)", opacity: 0).
  - Accompanied by a quick camera shake jitter on the container.
  - Feels: High-tech, explosive, chaotic energy.

• ARCHETYPE E: LUMINOUS ETHEREAL WAVE (Dreamlike Focus)
  - Implementation: Characters or words emerge from a soft lens blur (filter: "blur(12px) -> blur(0px)", opacity: 0 -> 1) with a soft glowing aura.
  - Feels: Spiritual, introspective, celestial.

------------------------------------------------------
3. CINEMATIC 2.5D CAMERA DOLLY & IMAGE MOTION (NO CARTOON BOUNCES)
------------------------------------------------------
Do NOT leave images completely frozen, but NEVER use cartoon bounces or spinning!
Use authentic Hollywood 2.5D multi-plane camera physics:
- PARALLAX CAMERA DOLLY:
  Throughout each scene, animate both the background plate and hero cutout at slightly different optical speeds:
  * Background Plate: Slow, majestic dolly (scale: 1.0 -> 1.05, y: 0 -> -15px) across the scene duration.
  * Hero Cutout: Drifts at a different rate (scale: 1.0 -> 1.10, y: 0 -> -28px, x: 0 -> +10px).
  * Optical Illusion: The speed difference creates genuine 3D stereoscopic depth that looks like a real film dolly!
- FOCAL BREATHING:
  Add a subtle, organic vertical oscillation to the hero cutout (y: 0 -> -5px -> 0 over 4s with ease: "sine.inOut") so the subject feels living and breathing.
- RACK FOCUS (Optional for dramatic transitions):
  Background can start with subtle lens blur (filter: "blur(6px)"), sharpening to crisp focus (filter: "blur(0px)") on the first major vocal drop.

------------------------------------------------------
4. DYNAMIC LIGHTING SHIFTS, CAMERA SHAKE & VISUAL FX
------------------------------------------------------
HyperFrames is headless Chromium capturing the exact DOM/CSS canvas at 24fps. All CSS filters and GSAP transforms render deterministically:
- DYNAMIC LIGHTING SHIFTS:
  Animate the CSS filter on the background plate to react to musical moments:
  * Dramatic Beat Flash / Lightning:
    tl.to(bgImg, { filter: "brightness(1.6) contrast(1.3)", duration: 0.08, ease: "power2.out" })
      .to(bgImg, { filter: "brightness(0.95) contrast(1.05)", duration: 0.5, ease: "power1.out" });
  * Mood Shift: Smoothly transition saturation or temperature (filter: saturate(1.4)) during chorus sections.
- CAMERA SHAKE ON CLIMAX BEATS:
  Wrap the entire viewport stage inside <div id="camera-rig">. On the heaviest climax word/drop, trigger a rapid micro-jitter:
  tl.to("#camera-rig", {
    duration: 0.04,
    x: "random(-10, 10)",
    y: "random(-6, 6)",
    rotation: "random(-0.4, 0.4)",
    repeat: 5,
    yoyo: true,
    ease: "none"
  }).to("#camera-rig", { x: 0, y: 0, rotation: 0, duration: 0.08 });
- CHROMATIC ABERRATION (RGB SPLIT):
  On peak emphasis words, animate text-shadow: -6px 0 rgba(255,0,80,0.8), 6px 0 rgba(0,255,255,0.8) for 0.15s, then snap to clean white.

------------------------------------------------------
5. UPPER HEADROOM BILLBOARD & OCCLUSION SAFETY
------------------------------------------------------
- In Layer 3 (Upper Headroom Billboard, behind subject):
  * Position text HIGH in the upper 18% to 32% of the frame (e.g. top: 120px to 200px in a 1280px canvas).
  * This guarantees that 85-90%+ of the letters remain completely visible in the open headroom sky/background plate, with only the bottom edge gracefully kissing or sliding behind the subject's top contour (hair, hat, shoulders, car roof).
  * NEVER place Layer 3 text in the vertical center (top: 450px-750px) where the main body of the subject would completely hide it!
- In Layer 5 (Foreground Hero Punch):
  * Place in front of the subject, positioned either in the upper chest area (top: 240px-300px) or lower third (top: 900px-1000px) for maximum legibility.

======================================================
TECHNICAL HYPERFRAMES CONTRACT
======================================================
1. Include required metadata:
   <meta name="hyperframes:version" content="0.8">
   <meta name="hyperframes:duration" content="${totalDuration}">
   <meta name="hyperframes:fps" content="24">
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
  <meta name="hyperframes:fps" content="24">
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
    <audio id="soundtrack" src="assets/audio/${audioFilename}" data-start="0" data-duration="${totalDuration}"></audio>
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

  /**
   * Generates a 100% Vector & CSS Motion Graphics HyperFrames composition using Claude Sonnet 5.5.
   * Completely eliminates raster images and rembg segmentation for blazingly fast renders.
   */
  public async generateMotionGraphicsCompositionHtml(
    transcript: FullTranscript,
    audioFilename: string,
    styleMode: 'abstract_kinetic' | 'narrative_iconography' = 'abstract_kinetic',
    trackName: string = 'Cinematic Song',
    aspectRatio: string = '9:16'
  ): Promise<string> {
    const totalDuration = transcript.words.length > 0
      ? Math.ceil(transcript.words[transcript.words.length - 1].end + 2.5)
      : 50;

    const dims = resolveDimensions(aspectRatio);

    // Dynamic continuous regions based on song duration: 3 to 5 narrative acts
    let regionCount = 3;
    if (totalDuration > 90) {
      regionCount = 5;
    } else if (totalDuration > 45) {
      regionCount = 4;
    }
    const regionDuration = totalDuration / regionCount;

    if (this.anthropic) {
      try {
        console.log(`[CompositionService] Calling Claude (${config.anthropicModel}) for High-End HyperFrames Motion Graphics (${styleMode}, ${regionCount} continuous acts)...`);

        const isNarrative = styleMode === 'narrative_iconography';

        const styleInstructions = isNarrative
          ? `### VISUAL STYLE: NARRATIVE ICONOGRAPHY & LYRIC SYMBOLS (Storytelling in Motion)
- Tell the story of the song through bespoke procedural inline SVG vector illustrations and animated symbols that visually embody the lyrics.
- Vector symbols must NOT be small static icons in a corner! They must be bold hero visual actors that dock directly onto the continuous spine or inhabit the world stage:
  * For wealth / manifestation / abundance themes: animate 3D tumbling gold coins (SVG with radial gradients), spinning bank vault lock dials that click and unlock, ascending geometric profit staircases with glowing apex points, faceted sparkling diamonds with light glints, and luxury crests.
  * For struggle / storm / victory themes: animate crackling SVG lightning arcs, swirling particle vortexes, compass needles aligning, shattered shield geometries reassembling, and expanding shockwave rings.
  * For dreams / focus / vision themes: glowing neon filaments, expanding horizon rings, floating isometric architectural cubes, and luminous light beams.
- Every symbol must have a motivated entrance, idle breathing during the camera dwell, and dynamic reaction to peak vocal drops (bursting, unlocking, expanding, or igniting).
- The vector illustrations must be prominent, beautifully styled with glowing strokes, radial gradients, and drop shadows.`
          : `### VISUAL STYLE: ABSTRACT KINETIC & GRAPHIC DESIGN (Apple Keynote / Spotify Canvas / Studio Vox)
- High-precision modern graphic design motion: dynamic geometric vectors, neon audio visualizer waveform ribbons, animated sound pulses, isometric wireframe grid floor in 3D CSS perspective, speed streaks, and chromatic dispersion.
- ZERO external image files. Everything created using inline SVG, HTML5 elements, and CSS transforms.
- Clean, curated color palette: deep obsidian background (#07090e / #0a0e17), paired with electric mint (#3CE6AC) & cyan (#00E3FF), or radiant gold (#FFD700) & amber (#FF8800), with crisp white typography.
- Dynamic geometric visualizers: concentric pulsing sonar rings, undulating audio waveforms, isometric matrix lattices, and chromatic RGB split kicks on heavy vocal drops.`;

        const prompt = `
You are an elite motion graphics director and creative coder authoring a masterclass music video composition for HyperFrames, following the official HyperFrames Motion Grammar and Cinematography Contract (https://hyperframes.heygen.com/prompting/motion).

Your goal: Produce a complete, production-ready, standalone HTML5 motion graphics video composition based on the provided song lyrics and word-level timestamps. 
NO EXTERNAL IMAGES OR ASSETS MAY BE USED. Every visual element must be created procedurally using HTML5, inline SVG vectors, CSS3 3D transforms, and GSAP 3 animations.

======================================================
PROJECT & CANVAS SPECIFICATIONS
======================================================
- Song Title: "${trackName}"
- Audio File: "assets/audio/${audioFilename}" (Must be linked via <audio id="soundtrack" src="assets/audio/${audioFilename}" data-start="0" data-duration="${totalDuration}"></audio>)
- Canvas Format: ${dims.resolution} (${dims.width}px x ${dims.height}px, ${dims.isVertical ? 'Vertical 9:16 Mobile / TikTok / Reels' : 'Horizontal 16:9'})
- Total Duration: ${totalDuration} seconds (Target 24 FPS)
- Narrative Journey: ${regionCount} continuous thematic regions (~${regionDuration.toFixed(1)}s per region)
- Motion Graphics Mode: ${styleMode.toUpperCase()}

======================================================
WORD-LEVEL TRANSCRIPT (TIMED IN SECONDS)
======================================================
${JSON.stringify(transcript.words, null, 2)}

======================================================
CRITICAL: THE HYPERFRAMES CINEMATOGRAPHY CONTRACT
======================================================
The #1 failure of AI motion graphics is the "Slideshow Anti-Pattern" (independent boxes that fade in centered, sit idle, and fade out). You MUST strictly follow the official HyperFrames cinematography contract:

1. ONE CONTINUOUS WORLD-CAMERA (DWELL-AND-SWEEP RHYTHM):
   - Wrap the main canvas inside a world-camera container: <div id="camera-world">.
   - The camera dollies smoothly across the continuous world space (pans x/y, subtle 5-8% push-ins z/scale, perspective tilts) in ONE unbroken journey across the song.
   - Dwell-and-Sweep: The camera SWEEPS dynamically between lyric regions, then eases to a genuine REST / DWELL (1.5s–2.5s) at each hero lyric drop / chorus anchor point.
   - The World NEVER Freezes: During a camera dwell, the camera rests but the film keeps resolving (ambient particle drift, glowing pulses, waveform oscillation, secondary shimmer).
   - Region changes happen by ARRIVING through camera travel or parallax, NOT by hard cuts or centered fade-outs.
   - STRICT NEGATIVE: NO slideshow tells! No element cluster that fades in centered, sits, and fades out. No isolated boxes.

2. THE PERSISTENT VISUAL SPINE (THE CONTINUOUS THREAD):
   - Include a continuous visual element that spans the ENTIRE video and NEVER leaves the frame: <svg id="persistent-spine"> (e.g. an illuminated 3px laser wire, an audio waveform ribbon, or an isometric trajectory rail).
   - This spine is the physical anchor of the video: as the camera dollies, the spine threads between regions, morphing its geometry (e.g. an audio waveform in verse 1, an ascending journey vector in chorus, a radiant resonant loop in climax).
   - Lyrics and hero symbols dock onto or interact with this spine.

3. THREE DEPTH PLANES & FOREGROUND OCCLUSION (RULE 6):
   - Structure your scene with 3 distinct z-depth planes:
     * Plane 1 (Far Background, z-index: 1): Subtle isometric grid floor, cosmic dust particles, or deep ambient gradient drifting at 0.2x camera speed.
     * Plane 2 (Main World Stage, z-index: 10): The persistent spine, lyric typography, and hero vector graphics traveling at 1.0x camera speed.
     * Plane 3 (Near Foreground Lens, z-index: 50): Large, heavily blurred elements (filter: blur(18px-28px)), floating luminous particles, or chromatic bokeh shards sweeping past close to the lens at 3x-6x camera speed.
     * OCCLUSION MANDATE: Foreground elements MUST visibly cross in front of the typography/spine. This occlusion physically proves 3D depth to the viewer's eye.

4. THE 8 RULES OF PREMIUM MOTION EXECUTION:
   - Rule 1 (Nothing ever fully stops): Always maintain an ambient idle drift or 1-2% breathing scale. Never write a frozen hold.
   - Rule 2 (Camera is an actor): Continuous subtle push-in or parallax drift across the entire timeline.
   - Rule 3 (Overlapping action): Stagger character and word entrances (0.02s-0.04s stagger); start entering the next visual element while the previous is still settling.
   - Rule 4 (Motivated compounds): Entrances ease out (power3.out, back.out(2)), impacts ease in (power2.in), exits ease in. Never combine gratuitous simultaneous spin, blur, and slide.
   - Rule 5 (Overshoot & follow-through): Visual transforms have physical mass overshoots (back.out(2)), with secondary elements settling a beat later.
   - Rule 6 (Depth planes & occlusion): Respect the 3-plane hierarchy.
   - Rule 7 (Pacing to genre): Hit downbeats hard with snappy beat-locked typography and micro-chromatic RGB kicks.
   - Rule 8 (Deterministic execution): Deterministic timeline seekable to any frame.

======================================================
STYLE & STORYTELLING DIRECTION
======================================================
${styleInstructions}

------------------------------------------------------
KINETIC TYPOGRAPHY SYSTEM (ZERO-OVERLAP RULE)
------------------------------------------------------
1. ZERO OVERLAPPING:
   - When a phrase ends, it MUST cleanly exit before or precisely as the next phrase arrives. No collisions!
2. CADENCE-DRIVEN GROUPING:
   - Group rapid words (<0.4s apart) into natural lyrical phrases (3-6 words).
   - Animate characters/words with punchy ease-out physics: character-stagger baseline rises (<span class="char">), elastic scale-down pops (scale: 1.6 -> 1.0 with back.out(2)), or luminous mask wipes.
3. HERO PUNCH WORDS:
   - For rhyming peaks, chorus drops, or key emotional words: give 1.8x - 2.5x scale, neon glow stabs, chromatic RGB splits (text-shadow: -5px 0 #ff0055, 5px 0 #00ffff), or glowing outline strokes.
4. SAFE POSITIONING:
   - All text must fit within ${dims.maxLineWidth}px width with at least 10% margins top and bottom (${dims.isVertical ? 'top: 180px to 950px' : 'top: 120px to 850px'}) for perfect legibility.

======================================================
TECHNICAL HYPERFRAMES CONTRACT
======================================================
1. Include required metadata in <head>:
   <meta name="hyperframes:version" content="0.8">
   <meta name="hyperframes:duration" content="${totalDuration}">
   <meta name="hyperframes:fps" content="24">
   <meta name="hyperframes:resolution" content="${dims.resolution}">
   <meta name="viewport" content="width=${dims.width}, height=${dims.height}, initial-scale=1.0">
2. Load GSAP 3: <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
3. CSS: html, body, and root stage MUST be exactly ${dims.width}px by ${dims.height}px with overflow: hidden; background: #07090e; font-family: 'Inter', system-ui, -apple-system, sans-serif;
4. GSAP Timeline MUST be registered deterministically:
   const tl = gsap.timeline({ paused: true });
   window.__timelines = window.__timelines || {};
   window.__timelines["main"] = tl;
   tl.seek(0);
   (Do NOT use tl.play() or Date.now() - HyperFrames seeks frame by frame).
5. Output ONLY the raw self-contained HTML document wrapped in \`\`\`html ... \`\`\`.
`;

        console.log(`\n======================================================`);
        console.log(`🤖 [CompositionService] FULL CINEMATIC MOTION GRAPHICS PROMPT SENT TO CLAUDE (${config.anthropicModel}):`);
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

        const textContent = (response.content || [])
          .filter((b: any) => b.type === 'text' || b.text)
          .map((b: any) => b.text || '')
          .join('\n')
          .trim();

        console.log(`[CompositionService] Claude responded (${textContent.length} characters received).`);

        const htmlMatch = textContent.match(/```html([\s\S]*?)```/) || textContent.match(/<html[\s\S]*?<\/html>/i);
        if (htmlMatch) {
          const generatedHtml = htmlMatch[1] ? htmlMatch[1].trim() : htmlMatch[0].trim();
          if (transcript.words.length > 0 && generatedHtml.includes(transcript.words[0].word)) {
            console.log(`✓ [CompositionService] Claude Cinematic Motion Graphics composition validated and accepted! (${generatedHtml.length} characters)`);
            return generatedHtml;
          } else {
            console.warn('[CompositionService] Claude motion graphics output did not contain actual song words. Falling back to master motion graphics.');
          }
        } else {
          console.warn('[CompositionService] Claude response did not contain clear HTML block. Falling back to master motion graphics.');
        }
      } catch (err: any) {
        console.error(`[CompositionService] Claude Motion Graphics API error: ${err.message}. Using master motion graphics.`);
      }
    }

    return this.buildMasterMotionGraphicsHtml(transcript, audioFilename, styleMode, totalDuration, trackName, dims, regionCount);
  }

  /**
   * Deterministic Master Motion Graphics fallback composition implementing
   * Continuous World-Camera, Persistent Spine, 3 Depth Planes & Foreground Occlusion
   */
  public buildMasterMotionGraphicsHtml(
    transcript: FullTranscript,
    audioFilename: string,
    styleMode: 'abstract_kinetic' | 'narrative_iconography',
    totalDuration: number,
    trackName: string,
    dims: DimensionConfig,
    sceneCount: number
  ): string {
    const { width, height, resolution, fontSize, isVertical } = dims;

    // Group words into phrases (3 to 5 words each)
    const phrases: Array<{ id: string; text: string; start: number; end: number; words: TranscriptWord[]; posX: number; posY: number }> = [];
    let curWords: TranscriptWord[] = [];

    // Assign dynamic camera coordinates across world space
    const centerTop = isVertical ? 860 : 450;
    const offsets = [
      { x: 0, y: centerTop },
      { x: -30, y: centerTop - 40 },
      { x: 40, y: centerTop + 30 },
      { x: -20, y: centerTop + 60 },
      { x: 30, y: centerTop - 30 }
    ];

    for (let i = 0; i < transcript.words.length; i++) {
      const w = transcript.words[i];
      curWords.push(w);
      const isLast = i === transcript.words.length - 1;
      const pauseAfter = !isLast && (transcript.words[i + 1].start - w.end > 0.45);

      if (curWords.length >= 4 || pauseAfter || isLast) {
        const start = curWords[0].start;
        const end = curWords[curWords.length - 1].end;
        const text = curWords.map(cw => cw.word).join(' ');
        const offset = offsets[phrases.length % offsets.length];
        phrases.push({ 
          id: `phrase-${phrases.length}`, 
          text, 
          start, 
          end, 
          words: [...curWords],
          posX: offset.x,
          posY: offset.y
        });
        curWords = [];
      }
    }

    // Generate HTML for phrases
    const phrasesHtml = phrases.map(p => `
      <div id="${p.id}" class="kinetic-phrase" style="top: ${p.posY}px;">
        ${p.words.map((w, idx) => `<span class="k-word word-${idx}">${w.word}</span>`).join(' ')}
      </div>
    `).join('\n');

    // Generate GSAP timeline steps for phrases with Dwell-and-Sweep camera motion
    const phrasesJs = phrases.map(p => `
      // Phrase: "${p.text}" (${p.start}s - ${p.end}s)
      tl.fromTo("#${p.id}", 
        { opacity: 0, scale: 0.82, x: ${p.posX}, y: 40, filter: "blur(8px)" },
        { opacity: 1, scale: 1, x: ${p.posX}, y: 0, filter: "blur(0px)", duration: 0.28, ease: "back.out(2)" },
        ${p.start}
      );
      // Subtle camera pan to frame the phrase
      tl.to("#camera-world", {
        x: ${-p.posX * 0.4},
        y: ${(centerTop - p.posY) * 0.3},
        duration: 0.5,
        ease: "power2.out"
      }, ${p.start});
      // Phrase exit before next
      tl.to("#${p.id}",
        { opacity: 0, scale: 1.15, x: ${p.posX}, y: -30, filter: "blur(6px)", duration: 0.22, ease: "power2.in" },
        ${p.end + 0.12}
      );
    `).join('\n');

    const isNarrative = styleMode === 'narrative_iconography';
    const accentColor = isNarrative ? '#FFD700' : '#3CE6AC';
    const secondaryColor = isNarrative ? '#FF8800' : '#00E3FF';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${trackName} - High-End Motion Graphics</title>
  <meta name="hyperframes:version" content="0.8">
  <meta name="hyperframes:duration" content="${totalDuration}">
  <meta name="hyperframes:fps" content="24">
  <meta name="hyperframes:resolution" content="${resolution}">
  <meta name="viewport" content="width=${width}, height=${height}, initial-scale=1.0">
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: ${width}px; height: ${height}px;
      overflow: hidden; background: #07090e;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #stage {
      position: relative; width: 100%; height: 100%;
      background: radial-gradient(circle at 50% 40%, #151d30 0%, #060911 85%);
      overflow: hidden; perspective: 1200px;
    }

    /* PLANE 1: FAR BACKGROUND (0.2x speed) */
    #far-plane {
      position: absolute; inset: 0; pointer-events: none; z-index: 1;
    }
    .iso-grid {
      position: absolute; width: 200%; height: 200%; left: -50%; top: -20%;
      background-image: 
        linear-gradient(rgba(60, 230, 172, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(60, 230, 172, 0.05) 1px, transparent 1px);
      background-size: 50px 50px;
      transform: rotateX(65deg);
      transform-origin: center center;
    }

    /* PLANE 2: CONTINUOUS CAMERA WORLD (1.0x speed) */
    #camera-world {
      position: absolute; inset: 0; z-index: 10;
      transform-origin: center center;
    }

    /* PERSISTENT VISUAL SPINE (Never leaves frame) */
    #persistent-spine-wrap {
      position: absolute; inset: 0; pointer-events: none; z-index: 5;
    }
    #spine-line {
      fill: none; stroke: url(#spineGrad); stroke-width: 3.5;
      stroke-linecap: round; filter: drop-shadow(0 0 10px ${accentColor});
    }

    /* HERO SYMBOLS & GRAPHICS */
    .hero-stage-symbol {
      position: absolute; top: ${isVertical ? '220px' : '150px'}; left: 50%;
      transform: translateX(-50%); width: 220px; height: 220px;
      pointer-events: none;
    }

    /* KINETIC TYPOGRAPHY CONTAINER */
    .kinetic-phrase {
      position: absolute; left: 0; width: 100%;
      padding: 0 ${isVertical ? '48px' : '80px'};
      text-align: center; font-size: ${fontSize}px;
      font-weight: 850; line-height: 1.22; letter-spacing: -0.02em;
      color: #ffffff; text-transform: uppercase;
      opacity: 0; pointer-events: none;
      text-shadow: 0 4px 24px rgba(0,0,0,0.85);
      z-index: 15;
    }
    .k-word {
      display: inline-block; margin: 0 4px;
    }
    .k-word:nth-child(even) {
      color: ${accentColor};
      text-shadow: 0 0 20px ${accentColor}88;
    }

    /* PLANE 3: NEAR FOREGROUND LENS (3x-6x speed with heavy blur & OCCLUSION) */
    #foreground-lens {
      position: absolute; inset: 0; pointer-events: none; z-index: 50;
    }
    .lens-mote {
      position: absolute; border-radius: 50%;
      background: radial-gradient(circle, ${secondaryColor}cc 0%, ${accentColor}00 70%);
      filter: blur(22px); mix-blend-mode: screen;
    }
    .mote-1 { width: 180px; height: 180px; top: 15%; left: -50px; }
    .mote-2 { width: 240px; height: 240px; bottom: 10%; right: -80px; }
    .mote-3 { width: 140px; height: 140px; top: 60%; left: -60px; }
  </style>
</head>
<body>
  <div id="stage" data-composition-id="main" data-width="${width}" data-height="${height}">
    <!-- Plane 1: Far Background -->
    <div id="far-plane">
      <div class="iso-grid"></div>
    </div>

    <!-- Plane 2: Camera World -->
    <div id="camera-world">
      <!-- Persistent Spine SVG -->
      <div id="persistent-spine-wrap">
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
          <defs>
            <linearGradient id="spineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="${secondaryColor}" />
              <stop offset="50%" stop-color="${accentColor}" />
              <stop offset="100%" stop-color="${secondaryColor}" />
            </linearGradient>
          </defs>
          <path id="spine-line" d="M 0 ${isVertical ? 460 : 360} Q ${width * 0.25} ${isVertical ? 430 : 330}, ${width * 0.5} ${isVertical ? 470 : 370} T ${width} ${isVertical ? 450 : 350}" />
        </svg>
      </div>

      <!-- Hero Visual Symbol (Docked to Stage) -->
      <div class="hero-stage-symbol">
        ${isNarrative ? `
        <!-- Narrative: Vault Lock Dial & Manifestation Crest -->
        <svg id="heroSymbolSvg" viewBox="0 0 200 200" width="100%" height="100%">
          <circle cx="100" cy="100" r="85" fill="none" stroke="${accentColor}" stroke-width="3" stroke-dasharray="8 6" opacity="0.8" />
          <circle cx="100" cy="100" r="65" fill="#0c1220" stroke="${secondaryColor}" stroke-width="4" filter="drop-shadow(0 0 12px ${accentColor})" />
          <path d="M 100 45 L 100 155 M 45 100 L 155 100" stroke="${accentColor}" stroke-width="2.5" />
          <polygon points="100,55 135,100 100,145 65,100" fill="none" stroke="#ffffff" stroke-width="2.5" />
          <text x="100" y="108" text-anchor="middle" font-size="28" font-weight="bold" fill="#ffffff" filter="drop-shadow(0 0 8px ${accentColor})">$</text>
        </svg>
        ` : `
        <!-- Abstract: Dynamic Radar Core & Visualizer Rings -->
        <svg id="heroSymbolSvg" viewBox="0 0 200 200" width="100%" height="100%">
          <circle cx="100" cy="100" r="88" fill="none" stroke="${secondaryColor}" stroke-width="2" stroke-dasharray="6 4" opacity="0.6" />
          <circle cx="100" cy="100" r="70" fill="none" stroke="${accentColor}" stroke-width="3" filter="drop-shadow(0 0 10px ${accentColor})" />
          <polygon points="100,40 152,70 152,130 100,160 48,130 48,70" fill="rgba(60,230,172,0.06)" stroke="${secondaryColor}" stroke-width="2" />
          <circle cx="100" cy="100" r="24" fill="${accentColor}" opacity="0.85" filter="drop-shadow(0 0 15px ${accentColor})" />
        </svg>
        `}
      </div>

      <!-- Kinetic Phrases -->
      ${phrasesHtml}
    </div>

    <!-- Plane 3: Near Foreground Lens (Crosses in front of words) -->
    <div id="foreground-lens">
      <div id="mote1" class="lens-mote mote-1"></div>
      <div id="mote2" class="lens-mote mote-2"></div>
      <div id="mote3" class="lens-mote mote-3"></div>
    </div>

    <audio id="soundtrack" src="assets/audio/${audioFilename}" data-start="0" data-duration="${totalDuration}"></audio>
  </div>
  <script>
    (function () {
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      
      // Rule 1 & 2: Camera Continuous Push-In & Ambient Drift
      tl.to("#camera-world", { scale: 1.07, duration: ${totalDuration}, ease: "none" }, 0);
      tl.to(".iso-grid", { y: "+=120", duration: ${totalDuration}, ease: "none" }, 0);
      
      // Hero Symbol Continuous Living Rotation & Pulse
      tl.to("#heroSymbolSvg", { rotation: 360, duration: 25, ease: "none", repeat: 4 }, 0);
      tl.to("#heroSymbolSvg", { scale: 1.06, yoyo: true, repeat: 20, duration: 2.2, ease: "sine.inOut" }, 0);

      // Persistent Spine Waveform Breathing
      tl.to("#spine-line", { strokeDashoffset: -200, duration: 15, ease: "none", repeat: 4 }, 0);

      // Plane 3: Foreground Motes sweeping close to lens (Occluding words)
      tl.fromTo("#mote1", { x: -80, y: 0 }, { x: ${width + 100}, y: 80, duration: 7, repeat: 6, ease: "none" }, 0);
      tl.fromTo("#mote2", { x: 80, y: 0 }, { x: ${-width - 100}, y: -60, duration: 9, repeat: 5, ease: "none" }, 0);
      tl.fromTo("#mote3", { x: -60, y: 0 }, { x: ${width + 80}, y: -40, duration: 11, repeat: 4, ease: "none" }, 0);

      // Kinetic Typography & Dwell-and-Sweep Camera
      ${phrasesJs}

      window.__timelines["main"] = tl;
      tl.seek(0);
    })();
  </script>
</body>
</html>`;
  }
}

export const compositionService = new CompositionService();
