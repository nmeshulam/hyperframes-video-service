import { config } from '../config.js';
import { StoryPlan, StoryScene } from './story.service.js';
import fs from 'fs';
import path from 'path';

export interface GeneratedSceneImage {
  sceneIndex: number;
  imageFilename: string;
  imagePath: string;
  base64Data: string;
  promptUsed: string;
}

export class ImageService {
  /**
   * Generates 3 sequential scene images using OpenRouter Image Model,
   * passing previous image as a visual reference for facial and character consistency.
   */
  public async generateSceneImages(
    storyPlan: StoryPlan,
    outputDir: string,
    aspectRatio: string = '16:9'
  ): Promise<GeneratedSceneImage[]> {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const generatedImages: GeneratedSceneImage[] = [];
    let previousImageBase64: string | null = null;

    const isVertical = aspectRatio.includes('9:16') || aspectRatio.toLowerCase().includes('portrait') || aspectRatio.toLowerCase().includes('tiktok');
    const aspectPrompt = isVertical ? '9:16 vertical smartphone format' : '16:9 widescreen format';

    for (let i = 0; i < storyPlan.scenes.length; i++) {
      const scene = storyPlan.scenes[i];
      const sceneIndex = i + 1;
      const sceneStartTime = Date.now();

      let promptText = '';
      const messages: any[] = [];

      if (previousImageBase64) {
        promptText = `Create the next consecutive cinematic scene for this music video story. Maintain strict visual continuity with the reference image: preserve the exact same primary hero subjects (characters, vehicles, objects, creatures, or architecture), materials, color palette, lighting, and aesthetic world. Scene description: ${scene.imagePrompt}. Photographic style: ${storyPlan.artStyle}. ${aspectPrompt}.`;
        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: promptText
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${previousImageBase64}` }
            }
          ]
        });
      } else {
        promptText = `Create a cinematic photograph in this style: ${storyPlan.artStyle}. Scene description: ${scene.imagePrompt}. Volumetric dramatic lighting, rich textures, ground hero subjects in lower 60% with open atmospheric headroom in upper 40%, ${aspectPrompt}.`;
        messages.push({
          role: 'user',
          content: promptText
        });
      }

      console.log(`\n======================================================`);
      console.log(`🎨 [ImageService] SCENE ${sceneIndex}/3 GENERATION: "${scene.title}"`);
      console.log(`📷 Model: ${config.openrouterImageModel}`);
      console.log(`📝 Full Image Prompt:\n${promptText}`);
      if (previousImageBase64) {
        console.log(`🔗 Sequential Reference: Scene ${sceneIndex - 1} attached as visual anchor`);
      }
      console.log(`======================================================\n`);

      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.openrouterApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: config.openrouterImageModel,
            messages: messages
          })
        });

        const resData = await response.json() as any;
        if (resData.error) throw new Error(JSON.stringify(resData.error));

        const imgObj = resData.choices?.[0]?.message?.images?.[0];
        if (!imgObj) throw new Error(`No image object returned for scene ${sceneIndex}`);

        const dataUrl = imgObj.image_url?.url || imgObj.url || '';
        const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        if (!base64Data) throw new Error(`Missing base64 data for scene ${sceneIndex}`);

        const imageFilename = `scene_${sceneIndex}.jpg`;
        const imagePath = path.join(outputDir, imageFilename);
        fs.writeFileSync(imagePath, Buffer.from(base64Data, 'base64'));

        const elapsed = ((Date.now() - sceneStartTime) / 1000).toFixed(1);
        console.log(`✓ [ImageService] Scene ${sceneIndex} generated & saved in ${elapsed}s -> ${imageFilename}`);

        previousImageBase64 = base64Data;
        generatedImages.push({
          sceneIndex,
          imageFilename,
          imagePath,
          base64Data,
          promptUsed: promptText
        });
      } catch (err: any) {
        console.error(`[ImageService] Failed to generate image for scene ${sceneIndex}: ${err.message}`);
        if (generatedImages.length > 0) {
          const fallback = generatedImages[generatedImages.length - 1];
          const imageFilename = `scene_${sceneIndex}.jpg`;
          const imagePath = path.join(outputDir, imageFilename);
          fs.copyFileSync(fallback.imagePath, imagePath);
          console.warn(`[ImageService] Reused Scene ${fallback.sceneIndex} image for Scene ${sceneIndex}`);
          generatedImages.push({
            sceneIndex,
            imageFilename,
            imagePath,
            base64Data: fallback.base64Data,
            promptUsed: fallback.promptUsed
          });
        } else {
          throw err;
        }
      }
    }

    return generatedImages;
  }
}

export const imageService = new ImageService();
