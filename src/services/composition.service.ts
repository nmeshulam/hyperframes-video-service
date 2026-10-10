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
      fontSize: 54,
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
      fontSize: 60,
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
   * Builds the HyperFrames index.html composition using the actual song transcript
   * and the 3 story-generated scenes.
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

    // If Claude API is available, ask Claude to compose using the true transcript and scenes
    if (this.anthropic) {
      try {
        console.log(`[CompositionService] Calling Claude API (${config.anthropicModel}) for ${dims.resolution} composition...`);
        
        const prompt = `
You are an elite motion designer specializing in HyperFrames and GSAP kinetic typography.
Generate a complete, self-contained index.html for a ${dims.resolution} (${aspectRatio}) 30FPS lyric video.

CRITICAL INSTRUCTION - ZERO HALLUCINATIONS:
You MUST use ONLY the exact words and timestamps from the provided transcript below. Do NOT use placeholder lyrics or words from any other song. Every lyric word displayed in the video must match the transcript exactly.

Song Title: "${trackName}"
Audio File: assets/audio/${audioFilename}
Duration: ${totalDuration} seconds
Aspect Ratio: ${dims.resolution} (${aspectRatio})

Transcript Words with exact IDs and Timings:
${JSON.stringify(transcript.words.map(w => ({ id: w.id, word: w.word, start: w.start, end: w.end })), null, 2)}

3 Consecutive Visual Story Scenes:
${scenes.map((s, idx) => `Scene ${idx + 1}: "${s.title}" (${s.startTime}s - ${s.endTime}s)
  - Background: ${s.bgPath}
  - Subject Cutout: ${s.fgPath}
  - Color Theme: ${s.colorTheme}
  - Word IDs in this scene: ${JSON.stringify(s.wordIds)}
`).join('\n')}

TECHNICAL REQUIREMENTS:
1. Include metadata: <meta name="hyperframes:version" content="0.8">, duration="${totalDuration}", fps="30", resolution="${dims.resolution}".
2. Set viewport: <meta name="viewport" content="width=${dims.width}, height=${dims.height}, initial-scale=1.0">.
3. Import fonts: Montserrat (800, 900), Plus Jakarta Sans (700). Import GSAP: https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js.
4. CSS Dimensions: html, body, and root element MUST be exactly ${dims.width}px by ${dims.height}px.
5. In 9:16 vertical mode, respect mobile safe zones (center primary typography between y=700px and y=1300px; avoid top 120px and bottom 200px).
6. 2.5D Depth Stack per scene:
   - Layer 1: Background Plate (${scenes[0]?.bgPath}) with subtle scale/pan parallax.
   - Layer 2: Ambient lighting aura matching scene colorTheme.
   - Layer 3: Depth Lyrics displaying the exact words for that scene with word-by-word highlight boxes matching w.start and w.end.
   - Layer 4: Foreground Subject Cutout (${scenes[0]?.fgPath}) with reverse parallax so lyrics float between background and subject!
   - Layer 5: Subtle cinematic vignette.
7. Return ONLY the raw valid HTML inside \`\`\`html ... \`\`\` code block.
`;

        const response = await this.anthropic.messages.create({
          model: config.anthropicModel,
          max_tokens: 8192,
          system: skillLoaderService.getHyperframesSystemPrompt(),
          messages: [{ role: 'user', content: prompt }]
        });

        const textContent = response.content[0].type === 'text' ? response.content[0].text : '';
        const htmlMatch = textContent.match(/```html([\s\S]*?)```/) || textContent.match(/<html[\s\S]*?<\/html>/i);
        if (htmlMatch) {
          const generatedHtml = htmlMatch[1] ? htmlMatch[1].trim() : htmlMatch[0].trim();
          // Verify that it contains words from the actual transcript
          if (transcript.words.length > 0 && generatedHtml.includes(transcript.words[0].word)) {
            console.log('[CompositionService] Claude generated complete, customized composition matching song transcript.');
            return generatedHtml;
          } else {
            console.warn('[CompositionService] Claude output did not contain actual song words. Falling back to deterministic master composition.');
          }
        } else {
          console.warn('[CompositionService] Claude response did not contain clear HTML block. Falling back to deterministic master composition.');
        }
      } catch (err: any) {
        console.error(`[CompositionService] Claude API error: ${err.message}. Using deterministic master composition.`);
      }
    }

    // Deterministic Master Composition Engine built directly from the song transcript and 3 scenes
    return this.buildMasterStoryCompositionHtml(transcript, audioFilename, scenes, totalDuration, trackName, dims);
  }

  /**
   * Deterministic Master Composition Engine guaranteeing 100% accurate lyrics,
   * proper 2.5D layer depth, multi-scene transitions, and aspect ratio adaptation.
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

    // Build scene viewports
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
        <!-- Layer 1: Background Plate -->
        <img id="bg-scene-${sIdx}" class="bg-plate" src="${scene.bgPath}" alt="${scene.title}">

        <!-- Layer 2: Volumetric Ambient Aura -->
        <div id="aura-scene-${sIdx}" class="scene-aura aura-${scene.colorTheme || 'cyan'}"></div>

        <!-- Layer 3: Depth Lyrics (Between Background and Character) -->
        <div class="depth-lyrics-container">
          <div id="line-scene-${sIdx}" class="lyric-line theme-${scene.colorTheme || 'cyan'}">
            ${wordsHtml}
          </div>
        </div>

        <!-- Layer 4: Foreground Subject Cutout -->
        <img id="fg-scene-${sIdx}" class="fg-character" src="${scene.fgPath}" alt="Subject Cutout ${sIdx}">

        <!-- Scene Badge -->
        <div class="scene-badge">Scene ${sIdx} · ${scene.title}</div>
      </div>
      `;
    }).join('\n');

    // Build scene timeline transitions
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

        // Lyric Line Visibility
        tl.set("#line-scene-${sIdx}", { visibility: "visible" }, ${start + 0.1});
        tl.fromTo("#line-scene-${sIdx}", { opacity: 0, y: 35, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "power2.out" }, ${start + 0.1});
        tl.to("#line-scene-${sIdx}", { opacity: 0, y: -25, scale: 1.04, duration: 0.35, ease: "power2.in" }, ${Math.max(start + 0.5, end - 0.4)});
        tl.set("#line-scene-${sIdx}", { visibility: "hidden" }, ${end});
      `;
    }).join('\n');

    // Build exact word highlights for all transcript words
    const wordsJs = transcript.words.map(w => `
        // Word: "${w.word}" (${w.start}s - ${w.end}s)
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
    .aura-teal { background: radial-gradient(circle at 50% 50%, rgba(45, 212, 191, 0.45) 0%, transparent 70%); }

    /* Midground Depth Lyrics (Floating behind the subject cutout) */
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
    .theme-purple .word-highlight-bg {
      background: linear-gradient(135deg, #c084fc 0%, #9333ea 100%);
      box-shadow: 0 0 45px rgba(192, 132, 252, 0.8), 0 0 80px rgba(147, 51, 234, 0.5);
    }

    /* Layer 4: Foreground Subject Cutout */
    .fg-character {
      position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
      transform-origin: center center; z-index: 5; pointer-events: none;
      filter: drop-shadow(0 15px 35px rgba(0, 0, 0, 0.85));
    }

    /* Layer 5: Cinematic Vignette */
    .scene-finisher {
      position: absolute; inset: 0;
      background: radial-gradient(circle at 50% 50%, transparent 55%, rgba(2, 6, 23, 0.85) 100%);
      z-index: 6; pointer-events: none;
    }

    /* Scene Badge */
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
