import { sampleRulers } from './samples';

export function getRulerBySlug(slug: string) {
  return sampleRulers.find((ruler) => ruler.slug === slug);
}
