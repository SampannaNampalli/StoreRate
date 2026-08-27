import StarRating from './StarRating.jsx';

/**
 * Split screen for the signed-out pages: the register states what the
 * product is on the left, the form does the work on the right.
 *
 * The sample rows are real stores from the platform, so the rating meter
 * is legible before the reader ever meets it in a table.
 */
const SAMPLE = [
  { name: 'Riverside Book Depot', score: 4.8 },
  { name: 'Sunrise Electronics Emporium', score: 4.5 },
  { name: 'Metro Fashion House Boutique', score: 3.0 },
];

export default function AuthShell({ lede, note, wide, children }) {
  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <div className="auth-aside__brand">
          <span className="brand__name">StoreRate</span>
          <span className="brand__rule" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
        </div>

        <div className="auth-aside__body">
          <p className="auth-aside__lede">{lede}</p>
          <p className="auth-aside__note">{note}</p>
        </div>

        <div className="auth-aside__sample" aria-hidden="true">
          {SAMPLE.map((store) => (
            <div key={store.name} className="auth-aside__sample-row">
              <span>{store.name}</span>
              <span className="rating-cell">
                <StarRating value={store.score} size="sm" />
                <span className="rating__value">{store.score.toFixed(2)}</span>
              </span>
            </div>
          ))}
        </div>
      </aside>

      <main className="auth-main">
        <div className={`auth-card${wide ? ' auth-card--wide' : ''}`}>{children}</div>
      </main>
    </div>
  );
}
