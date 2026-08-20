import { notFound } from 'next/navigation';
import { RulerPage } from '@/components/RulerPage';
import { getRulerBySlug } from '@/content/rulers/getRuler';
import { sampleRulers } from '@/content/rulers/samples';

export function generateStaticParams() {
  return sampleRulers.map((ruler) => ({ slug: ruler.slug }));
}

export default async function RulerRoute({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ruler = getRulerBySlug(slug);

  if (!ruler) notFound();

  return <RulerPage ruler={ruler} />;
}
