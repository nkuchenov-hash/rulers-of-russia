import Link from 'next/link';
import { sampleRulers } from '@/content/rulers/samples';

export default function HomePage() {
  return (
    <main style={{ padding: 40 }}>
      <h1>Правители России — архитектурный прототип</h1>
      <p>Выберите тестовое историческое состояние:</p>
      <ul>
        {sampleRulers.map((ruler) => (
          <li key={ruler.slug}><Link href={`/rulers/${ruler.slug}`}>{ruler.canonicalName}</Link></li>
        ))}
      </ul>
    </main>
  );
}
