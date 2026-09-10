/**
 * The accepted Kit Pop login presentation, shared by the sign-in door and by
 * the Auth.js confirmation and recovery surfaces. One copy so the three
 * anonymous pages cannot drift apart: the masthead, the story column and the
 * MILO band are the accepted design, and `children` is the only slot.
 */
export function SigninShell({ children }: { children: React.ReactNode }) {
  const localArt = process.env.NEXT_PUBLIC_LOCAL_BRAND_ART === '1';

  return (
    <main className={`signin-kit-pop${localArt ? ' has-local-brand-art' : ''}`}>
      <header className="signin-masthead">
        <span>Descenders</span>
        <small>Season reports</small>
      </header>
      <div className="signin-entry">
        <section className="signin-story" aria-labelledby="signin-story-heading">
          <p className="eyebrow">Race day, together</p>
          <h1 id="signin-story-heading">Every result opens a conversation.</h1>
          <p>Who was there? What can we learn? What comes next?</p>
        </section>
        {children}
      </div>
      <section className="signin-milo" aria-labelledby="signin-milo-heading">
        {localArt ? (
          <img
            src="/local-brand/milo-lockup-orange.png"
            alt="Descenders Salem Composite logo featuring Milo"
          />
        ) : null}
        <div>
          <h2 id="signin-milo-heading">MILO rides with us.</h2>
          <p>Make the effort · Include everyone · Learn by trying · Offer encouragement</p>
        </div>
      </section>
    </main>
  );
}
