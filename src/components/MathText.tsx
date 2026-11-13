import katex from 'katex';

/**
 * $...$ (inline) және $$...$$ (block) формулалары бар мәтінді көрсету.
 * Мәтін бөліктері React арқылы экрандалады; KaTeX тек формула бөлігін рендерлейді
 * (trust: false — HTML/сілтеме командалары өшірулі).
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g).filter(Boolean);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        const block = part.startsWith('$$') && part.endsWith('$$') && part.length > 4;
        const inline = !block && part.startsWith('$') && part.endsWith('$') && part.length > 2;
        if (!block && !inline) {
          return (
            <span key={i} className="whitespace-pre-wrap">
              {part}
            </span>
          );
        }
        const tex = block ? part.slice(2, -2) : part.slice(1, -1);
        const html = katex.renderToString(tex, { displayMode: block, throwOnError: false, trust: false, strict: 'ignore' });
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </span>
  );
}
