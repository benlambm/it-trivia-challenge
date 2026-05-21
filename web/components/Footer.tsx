import React from 'react';

type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
  placeholder?: boolean;
};

const BRIGHTPOINT_LINKS: FooterLink[] = [
  { label: 'Brightpoint.edu', href: 'https://www.brightpoint.edu/', external: true },
  { label: 'IT Programs', href: 'https://www.brightpoint.edu/academics/career-clusters/information-technology/', external: true },
  { label: 'Apply Now', href: 'https://www.brightpoint.edu/applynow', external: true },
  { label: 'Visit Campus', href: 'https://www.brightpoint.edu/about/locations-tours', external: true },
  { label: 'Financial Aid', href: 'https://www.brightpoint.edu/paying-for-brightpoint/financial-aid/', external: true },
  { label: 'About', href: 'https://www.brightpoint.edu/about', external: true },
];

const ABOUT_LINKS: FooterLink[] = [
  { label: 'Source on GitHub', href: 'https://github.com/benlambm/it-trivia-challenge', external: true },
  { label: 'License (PolyForm NC 1.0.0)', href: 'https://github.com/benlambm/it-trivia-challenge/blob/main/LICENSE', external: true },
  { label: 'Powered by Google Gemini', href: 'https://ai.google.dev/', external: true },
  { label: 'GenKit AI Flows in TypeScript', href: 'https://genkit.dev/', external: true },
  { label: 'Report an Issue', href: 'https://github.com/benlambm/it-trivia-challenge/issues', external: true },
  { label: 'Built with React + Vite', href: 'https://vitejs.dev/', external: true },
];

const ExternalArrow: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
    aria-hidden="true"
    className="w-3 h-3 ml-1 opacity-50"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M7 7h10v10" />
  </svg>
);

const SoonPill: React.FC = () => (
  <span className="ml-2 inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-700 text-slate-300 rounded">
    soon
  </span>
);

const renderFooterLink = (link: FooterLink) => {
  if (link.placeholder) {
    return (
      <a
        href="#"
        aria-disabled="true"
        onClick={(e) => e.preventDefault()}
        className="inline-flex items-center text-slate-300 font-medium text-base cursor-not-allowed opacity-75"
      >
        {link.label}
        <SoonPill />
      </a>
    );
  }

  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center text-slate-200 font-medium text-base hover:text-[#E87722] transition-colors"
      >
        {link.label}
        <ExternalArrow />
      </a>
    );
  }

  return (
    <a
      href={link.href}
      className="inline-flex items-center text-slate-200 font-medium text-base hover:text-[#E87722] transition-colors"
    >
      {link.label}
    </a>
  );
};

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t-4 border-[#E87722] bg-[#173A45] text-slate-200 font-sans">
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-12 md:py-16">

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12">

          {/* Column 1 — Brand + GitHub CTA */}
          <div>
            <h3 className="text-3xl md:text-4xl font-black tracking-tight text-white mb-4">
              IT Trivia <span className="text-[#E87722]">Challenge</span>
            </h3>
            <p className="text-slate-300 leading-relaxed mb-6">
              Master the tech industry. Test your skills. Build your future.
            </p>
            <a
              href="https://github.com/benlambm/it-trivia-challenge"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 py-3 px-5 rounded-2xl bg-[#E87722] text-white font-black border-4 border-[#173A45] transition-all transform hover:-translate-y-1 hover:bg-black hover:shadow-[4px_4px_0px_0px_#E87722] active:translate-y-0 active:shadow-none"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="w-5 h-5">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              View Source on GitHub
            </a>
          </div>

          {/* Column 2 — Brightpoint */}
          <nav aria-label="Brightpoint">
            <h4 className="text-[#E87722] uppercase tracking-widest text-sm font-black mb-5">
              Brightpoint
            </h4>
            <ul className="space-y-3">
              {BRIGHTPOINT_LINKS.map((link) => (
                <li key={link.label}>{renderFooterLink(link)}</li>
              ))}
            </ul>
          </nav>

          {/* Column 3 — About This App */}
          <nav aria-label="About this app">
            <h4 className="text-[#E87722] uppercase tracking-widest text-sm font-black mb-5">
              About This App
            </h4>
            <ul className="space-y-3">
              {ABOUT_LINKS.map((link) => (
                <li key={link.label}>{renderFooterLink(link)}</li>
              ))}
            </ul>
          </nav>

        </div>

        <hr className="my-10 border-slate-700" />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-sm text-slate-400">
          <p>© {currentYear} Brightpoint IT Trivia Challenge</p>
          <p>Made for students exploring IT careers.</p>
        </div>

      </div>
    </footer>
  );
};

export default Footer;
