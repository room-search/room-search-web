import { DoorOpen, Heart, Star } from 'lucide-react';
import { formatDuration, formatScore, formatWon, safeImageUrl } from '../lib/formatters.js';

function Poster({ theme }) {
  const imageUrl = safeImageUrl(theme.photoUrl);
  return (
    <div className="theme-poster">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          width="136"
          height="184"
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.hidden = true;
            event.currentTarget.nextElementSibling?.removeAttribute('hidden');
          }}
        />
      ) : null}
      <div className="poster-fallback" hidden={Boolean(imageUrl)}>
        <DoorOpen size={24} strokeWidth={1.6} aria-hidden="true" />
      </div>
    </div>
  );
}

export default function ThemeCard({ theme, favorite, onFavorite, onOpen }) {
  const satisfaction = theme.review?.average ?? theme.satisfy;
  return (
    <article className="theme-card">
      <button
        type="button"
        className="theme-card-open"
        onClick={onOpen}
        aria-label={theme.name + ' 상세 정보 보기'}
      >
        <Poster theme={theme} />
        <div className="theme-card-body">
          <div className="theme-card-kicker">
            <span className={theme.isOpen ? 'theme-status is-open' : 'theme-status is-closed'}>
              <span className="status-dot" />{theme.isOpen ? '운영 중' : '운영 종료'}
            </span>
            {Number(satisfaction) > 0 ? (
              <span className="satisfaction" aria-label={'만족도 ' + formatScore(satisfaction)}>
                <Star size={13} fill="currentColor" /> {formatScore(satisfaction)}
              </span>
            ) : null}
          </div>
          <h3>{theme.name || '이름 없는 테마'}</h3>
          <div className="theme-card-scores">
            <span>난이도 <b>{formatScore(theme.difficulty)}</b></span>
            <span>공포도 <b>{formatScore(theme.fear)}</b></span>
          </div>
          <div className="theme-card-meta">
            <span>{formatDuration(theme.playtime)}</span>
            <span>{formatWon(theme.price)}</span>
          </div>
        </div>
      </button>
      <button
        type="button"
        className={favorite ? 'favorite-button is-favorite' : 'favorite-button'}
        onClick={() => onFavorite(theme)}
        aria-label={favorite ? theme.name + ' 찜 해제' : theme.name + ' 찜하기'}
        aria-pressed={favorite}
      >
        <Heart size={18} fill={favorite ? 'currentColor' : 'none'} />
      </button>
    </article>
  );
}
