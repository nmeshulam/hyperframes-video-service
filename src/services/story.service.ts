import { config } from '../config.js';
import { FullTranscript, TranscriptWord } from '../types.js';

export interface StoryScene {
  sceneNumber: number;
  title: string;
  startTime: number;
  endTime: number;
  vibe: string;
  colorTheme: string;
  imagePrompt: string;
  wordIds: string[];
}

export interface StoryPlan {
  artStyle: string;
  scenes: StoryScene[];
}

export class StoryService {
  /**
   * Generates a 3-scene narrative storyboard with image prompts mapped to transcript words
   */
  public async planStory(
    transcript: FullTranscript,
    trackName: string,
    aspectRatio: string = '16:9'
  ): Promise<StoryPlan> {
    const totalDuration = transcript.words.length > 0
      ? Math.ceil(transcript.words[transcript.words.length - 1].end + 2.0)
      : 50;

    const fullLyrics = transcript.words.map(w => w.word).join(' ');
    const isVertical = aspectRatio.includes('9:16') || aspectRatio.toLowerCase().includes('portrait') || aspectRatio.toLowerCase().includes('tiktok');
    const aspectDesc = isVertical ? '9:16 vertical composition, hero subjects grounded in lower 60% with open atmospheric headroom in upper 40%' : '16:9 widescreen composition with balanced negative space';

    const prompt = `
You are an award-winning cinematic music video director.
Analyze the following song lyrics and word timestamps to create a 3-scene narrative visual storyboard.

Song Title: "${trackName}"
Full Duration: ${totalDuration} seconds
Aspect Ratio: ${aspectRatio} (${aspectDesc})

Song Lyrics:
"${fullLyrics}"

Word Timestamps:
${JSON.stringify(transcript.words.map(w => ({ id: w.id, word: w.word, start: w.start, end: w.end })), null, 2)}

Requirements:
1. Divide the song into exactly 3 consecutive cinematic scenes covering 0s to ${totalDuration}s.
   - Scene 1: 0s to ~${Math.round(totalDuration / 3)}s (Intro and opening verse)
   - Scene 2: ~${Math.round(totalDuration / 3)}s to ~${Math.round((totalDuration * 2) / 3)}s (Build-up and core peak)
   - Scene 3: ~${Math.round((totalDuration * 2) / 3)}s to ${totalDuration}s (Climax and resolution)
2. The visual style MUST be PHOTOREALISTIC: "Cinematic photorealistic 35mm film photography, natural dramatic lighting, shallow depth of field, 8k resolution, volumetric atmosphere, ${aspectDesc}".
3. Creative Subject Direction: Choose whatever primary hero subject(s) best elevate the song's mood, genre, and lyrics—this can be a solo protagonist, two lovers/figures, a sleek sports car or motorcycle, a vintage musical instrument, a wild creature, sacred/mystical monuments, or grand natural phenomena. Maintain visual continuity of the established hero subject(s) across the 3 scenes.
4. Framing & Headroom (Essential for Typography): In every scene's imagePrompt, ensure primary hero subjects are grounded in the lower/mid region of the frame, leaving the upper 35-45% of the frame as open atmospheric negative space (sky, horizon, ambient background) so motion typography can breathe behind and above the subject.
4. Provide a rich, highly descriptive image prompt for each scene suitable for an AI photorealistic image model.
5. Map every single word ID from the timestamps to its corresponding scene based on timing so no words are left out.
6. Return ONLY valid JSON in this exact structure without markdown backticks:

{
  "artStyle": "Cinematic photorealistic 35mm film photography, natural dramatic lighting, shallow depth of field, 8k resolution, realistic human subject, ${aspectDesc}",
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "Scene 1 Title",
      "startTime": 0,
      "endTime": ${Math.round(totalDuration / 3)},
      "vibe": "mood description",
      "colorTheme": "cyan",
      "imagePrompt": "Detailed photorealistic 35mm film prompt for scene 1",
      "wordIds": ["w0", "w1"]
    },
    {
      "sceneNumber": 2,
      "title": "Scene 2 Title",
      "startTime": ${Math.round(totalDuration / 3)},
      "endTime": ${Math.round((totalDuration * 2) / 3)},
      "vibe": "mood description",
      "colorTheme": "crimson",
      "imagePrompt": "Detailed photorealistic 35mm film prompt for scene 2 featuring the exact same character in heightened intensity",
      "wordIds": ["w2"]
    },
    {
      "sceneNumber": 3,
      "title": "Scene 3 Title",
      "startTime": ${Math.round((totalDuration * 2) / 3)},
      "endTime": ${totalDuration},
      "vibe": "mood description",
      "colorTheme": "amber",
      "imagePrompt": "Detailed photorealistic 35mm film prompt for scene 3 featuring the exact same character in triumphant or radiant climax",
      "wordIds": ["w3"]
    }
  ]
}
`;

    if (!config.openrouterApiKey) {
      console.warn('[StoryService] OPENROUTER_API_KEY missing; using rule-based story plan.');
      return this.buildFallbackPlan(transcript, totalDuration, trackName, aspectDesc);
    }

    try {
      console.log(`[StoryService] Slicing song into 3 scenes via OpenRouter (${config.openrouterStoryModel})...`);
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.openrouterApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: config.openrouterStoryModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        })
      });

      const data = await response.json() as any;
      if (data.error) throw new Error(JSON.stringify(data.error));

      let content = data.choices?.[0]?.message?.content || '';
      content = content.replace(/```json/gi, '').replace(/```/g, '').trim();

      const parsed: StoryPlan = JSON.parse(content);
      if (parsed && Array.isArray(parsed.scenes) && parsed.scenes.length === 3) {
        console.log(`[StoryService] Story plan generated successfully (${parsed.scenes.length} scenes).`);
        return parsed;
      }
      throw new Error('Invalid scene array returned by Story LLM');
    } catch (err: any) {
      console.error(`[StoryService] Story LLM planning error: ${err.message}. Using fallback plan.`);
      return this.buildFallbackPlan(transcript, totalDuration, trackName, aspectDesc);
    }
  }

  private buildFallbackPlan(
    transcript: FullTranscript,
    totalDuration: number,
    trackName: string,
    aspectDesc: string
  ): StoryPlan {
    const t1 = Math.round(totalDuration / 3);
    const t2 = Math.round((totalDuration * 2) / 3);

    const s1Words = transcript.words.filter(w => w.start < t1).map(w => w.id);
    const s2Words = transcript.words.filter(w => w.start >= t1 && w.start < t2).map(w => w.id);
    const s3Words = transcript.words.filter(w => w.start >= t2).map(w => w.id);

    return {
      artStyle: `Cinematic photorealistic 35mm film photography, natural dramatic lighting, shallow depth of field, 8k resolution, realistic human subject, ${aspectDesc}`,
      scenes: [
        {
          sceneNumber: 1,
          title: 'The Spark',
          startTime: 0,
          endTime: t1,
          vibe: 'atmospheric, mysterious, rising energy',
          colorTheme: 'cyan',
          imagePrompt: `Cinematic close-up portrait of an intense expressive human subject in moody neon rim lighting, ${trackName} atmosphere, ${aspectDesc}`,
          wordIds: s1Words
        },
        {
          sceneNumber: 2,
          title: 'The Tempest',
          startTime: t1,
          endTime: t2,
          vibe: 'dramatic peak, electric energy',
          colorTheme: 'crimson',
          imagePrompt: `Dramatic medium shot of the same human subject surrounded by glowing sparks and neon haze, intense emotional expression, ${aspectDesc}`,
          wordIds: s2Words
        },
        {
          sceneNumber: 3,
          title: 'The Empire Reborn',
          startTime: t2,
          endTime: totalDuration,
          vibe: 'radiant, triumphant, golden resolution',
          colorTheme: 'amber',
          imagePrompt: `Triumphant cinematic wide shot of the same human subject in radiant golden sunlight, warm embers, epic scale, ${aspectDesc}`,
          wordIds: s3Words
        }
      ]
    };
  }
}

export const storyService = new StoryService();
