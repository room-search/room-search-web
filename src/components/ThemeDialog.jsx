import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Clock3,
  ExternalLink,
  Heart,
  MapPin,
  Phone,
  Share2,
  Star,
  X,
} from 'lucide-react';
import { getCafeDetail, getThemeDetail } from '../lib/api.js';
import { formatDuration, formatScore, formatWon, safeExternalUrl, safeImageUrl, safePhoneNumber } from '../lib/formatters.js';

const SCORES = [
  ['difficulty', '난이도'],
  ['fear', '공포도'],
  ['activity', '활동성'],
  ['story', '스토리'],
  ['problem', '문제'],
  ['interior', '인테리어'],
  ['act', '연기력'],
  ['satisfy', '만족도'],
];

export default function ThemeDialog({ theme, favorite, onFavorite, onClose, onToast }) {
  const [detail, setDetail] = useState(theme);
  const [cafe, setCafe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cafeError, setCafeError] = useState(false);
  const dialogRef = useRef(null);
  const themeImage = safeImageUrl(detail.photoUrl || theme.photoUrl);
  const cafeLabel = cafe?.name || '카페 정보';
  const coverCafeName = cafe?.name || detail.cafeName || theme.cafeName || cafeLabel;
  const contactUrl = useMemo(() => safeExternalUrl(cafe?.homepage), [cafe?.homepage]);
  const phoneNumber = safePhoneNumber(cafe?.phoneNo);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setCafeError(false);
    const themeRequest = getThemeDetail(theme.refId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setDetail(result);
        return result;
      })
      .catch(() => theme);
    const cafeRequest = theme.escapeCafeId
      ? getCafeDetail(theme.escapeCafeId, controller.signal)
          .then((result) => {
            if (!controller.signal.aborted) setCafe(result);
          })
          .catch(() => {
            if (!controller.signal.aborted) setCafeError(true);
          })
      : Promise.resolve();

    Promise.all([themeRequest, cafeRequest]).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });

    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    document.body.classList.add('has-modal');
    return () => {
      controller.abort();
      window.cancelAnimationFrame(frame);
      document.body.classList.remove('has-modal');
    };
  }, [theme]);

  function onDialogKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dialogRef.current.querySelectorAll(
      'button:not([disabled]), a[href], select:not([disabled]), input:not([disabled])',
    )].filter((item) => item.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function shareTheme() {
    const url = new URL(window.location.href);
    url.searchParams.set('theme', String(detail.refId || theme.refId));
    const text = '룸서치에서 ' + (detail.name || theme.name) + ' 테마를 확인해 보세요.';
    try {
      if (navigator.share) {
        await navigator.share({ title: detail.name || theme.name, text, url: url.href });
        return;
      }
      await navigator.clipboard.writeText(url.href);
      onToast('테마 링크를 복사했어요.');
    } catch (error) {
      if (error?.name !== 'AbortError') onToast('링크를 복사하지 못했어요.');
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="theme-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-dialog-title"
        tabIndex="-1"
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <button type="button" className="dialog-close icon-button" onClick={onClose} aria-label="상세 정보 닫기">
          <X size={19} />
        </button>
        <div className="dialog-scroll">
          <div className="dialog-cover">
            {themeImage ? <img src={themeImage} alt="" /> : <div className="dialog-poster-placeholder" aria-hidden="true">포스터 이미지 없음</div>}
            <div className="dialog-cover-copy">
              <div className="detail-actions">
                <div className="detail-icon-actions">
                  <button
                    type="button"
                    className={favorite ? 'icon-button is-favorite' : 'icon-button'}
                    onClick={() => onFavorite(detail)}
                    aria-label={favorite ? '찜 해제' : '찜하기'}
                    aria-pressed={favorite}
                  >
                    <Heart size={18} fill={favorite ? 'currentColor' : 'none'} />
                  </button>
                  <button type="button" className="icon-button" onClick={shareTheme} aria-label="테마 공유">
                    <Share2 size={18} />
                  </button>
                </div>
              </div>
              <div className="detail-title-block">
                <div className="detail-cover-title-row">
                  <h2 id="theme-dialog-title">{detail.name || theme.name || '테마 상세'}</h2>
                  <span className={detail.isOpen ? 'status-pill is-open' : 'status-pill is-closed'}>
                    <span className="status-dot" />{detail.isOpen ? '운영 중' : '운영 종료'}
                  </span>
                </div>
                <p className="dialog-cover-cafe">{coverCafeName}</p>
                {loading ? <span className="detail-loading" role="status">불러오는 중</span> : null}
              </div>
              <div className="detail-score-highlights" role="group" aria-label="난이도와 공포도">
                {[
                  ['difficulty', '난이도'],
                  ['fear', '공포도'],
                ].map(([key, label]) => {
                  const value = Number(detail[key]);
                  const valid = Number.isFinite(value) && value > 0;
                  return (
                    <div className="detail-score-highlight" key={key}>
                      <span>{label}</span>
                      <strong>{valid ? formatScore(value) : '—'}</strong>
                      <span className="detail-score-highlight-track" aria-hidden="true">
                        <span style={{ width: valid ? (Math.min(5, value) / 5) * 100 + '%' : '0%' }} />
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="detail-quick-facts">
                <div><span>플레이 시간</span><strong><Clock3 size={16} />{formatDuration(detail.playtime)}</strong></div>
                <div><span>1인 가격</span><strong>{formatWon(detail.price)}</strong></div>
                <div><span>만족도</span><strong className="detail-rating"><Star size={15} fill="currentColor" />{formatScore(detail.review?.average ?? detail.satisfy)}</strong></div>
              </div>
            </div>
          </div>

          <div className="dialog-content">
            <section className="detail-section">
              <div className="section-heading"><div><h3>평가</h3></div></div>
              <div className="score-list">
                {SCORES.map(([key, label]) => {
                  const value = Number(detail[key]);
                  const valid = Number.isFinite(value) && value > 0;
                  return (
                    <div className="score-row" key={key}>
                      <span>{label}</span>
                      <div className="score-track" aria-hidden="true">
                        <span style={{ width: valid ? (Math.min(5, value) / 5) * 100 + '%' : '0%' }} />
                      </div>
                      <strong>{valid ? formatScore(value) : '—'}</strong>
                    </div>
                  );
                })}
              </div>
            </section>

            {detail.description ? (
              <section className="detail-section">
                <div className="section-heading"><div><h3>테마 소개</h3></div></div>
                <p className="theme-intro">{detail.description}</p>
              </section>
            ) : null}

            {detail.review?.review || detail.review?.escapeTip ? (
              <section className="detail-section">
                <div className="section-heading review-heading">
                  <div><h3>전문리뷰</h3></div>
                  <p className="review-attribution">
                    전문리뷰는 '<a href="https://www.instagram.com/want_escape_/" target="_blank" rel="noopener noreferrer">방탈출 하고싶어요</a>' 채널로부터 지원받았습니다
                  </p>
                </div>
                {detail.review?.review ? <p className="review-quote">{detail.review.review}</p> : null}
                {detail.review?.escapeTip ? <p className="review-tip"><Check size={15} /> {detail.review.escapeTip}</p> : null}
              </section>
            ) : null}

            <section className="detail-section cafe-section">
              <div className="section-heading">
                <div>
                  <h3>{cafeLabel}</h3>
                </div>
                {cafe?.isOpen === true ? <span className="status-pill is-open">영업 중</span> : null}
              </div>
              {cafe?.address ? (
                <p className="cafe-address"><MapPin size={16} /> {cafe.address}</p>
              ) : null}
              {cafe?.area || cafe?.location ? (
                <p className="cafe-area">{[cafe.area, cafe.location].filter(Boolean).join(' · ')}</p>
              ) : null}
              {cafeError ? <p className="cafe-error" role="status">카페 정보를 불러오지 못했어요.</p> : null}
              <div className="cafe-links">
                {contactUrl ? (
                  <a className="button button-primary" href={contactUrl} target="_blank" rel="noopener noreferrer">
                    예약 페이지 <ArrowUpRight size={16} />
                  </a>
                ) : null}
                {phoneNumber ? (
                  <a className="button button-secondary" href={'tel:' + phoneNumber}>
                    <Phone size={15} /> 전화하기
                  </a>
                ) : null}
                {!contactUrl && !phoneNumber && !loading ? (
                  <span className="source-note"><ExternalLink size={14} /> 공식 예약 정보가 등록되지 않았어요</span>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
