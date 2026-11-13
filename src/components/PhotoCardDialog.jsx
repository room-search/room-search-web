import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, Clipboard, Download, LoaderCircle, X } from 'lucide-react';
import { createPhotoCard } from '../lib/api.js';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthForDate(value) {
  if (!value) {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }
  const [year, month] = value.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function CalendarPicker({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => monthForDate(value));
  const pickerRef = useRef(null);
  const triggerRef = useRef(null);
  const monthLabel = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' }).format(visibleMonth);
  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const gridStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1 - monthStart.getDay());
  const days = Array.from({ length: 42 }, (_, index) => new Date(
    gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index,
  ));
  const today = dateKey(new Date());
  const selectedLabel = value ? value.replaceAll('-', '.') : '날짜를 선택해 주세요';

  useEffect(() => {
    if (value) setVisibleMonth(monthForDate(value));
  }, [value]);

  useEffect(() => {
    if (!isOpen) return undefined;
    function closeOnOutside(event) {
      if (!pickerRef.current?.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [isOpen]);

  function selectDate(date) {
    onChange(dateKey(date));
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function clearDate() {
    onChange('');
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <div className="photo-card-calendar" ref={pickerRef}>
      <button
        type="button"
        className={`photo-card-date-trigger${value ? ' is-selected' : ''}`}
        ref={triggerRef}
        aria-label={value ? `플레이 일자 ${selectedLabel}` : '플레이 일자 선택'}
        aria-expanded={isOpen}
        aria-controls="photo-card-calendar-panel"
        onClick={() => setIsOpen((open) => !open)}
      >
        <CalendarDays size={17} aria-hidden="true" />
        <span>{selectedLabel}</span>
        <ChevronDown size={16} className={isOpen ? 'is-open' : ''} aria-hidden="true" />
      </button>
      {isOpen ? (
        <div
          className="photo-card-calendar-panel"
          id="photo-card-calendar-panel"
          role="group"
          aria-label={`${monthLabel} 플레이 날짜 선택`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setIsOpen(false);
              window.requestAnimationFrame(() => triggerRef.current?.focus());
            }
          }}
        >
          <div className="photo-card-calendar-heading">
            <strong>{monthLabel}</strong>
            <div>
              <button type="button" aria-label="이전 달" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                <ChevronLeft size={17} />
              </button>
              <button type="button" aria-label="다음 달" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
          <div className="photo-card-calendar-grid" aria-label="요일별 날짜">
            {WEEKDAYS.map((weekday, index) => (
              <span key={weekday} className={index === 0 ? 'is-sunday' : index === 6 ? 'is-saturday' : ''}>{weekday}</span>
            ))}
            {days.map((date) => {
              const key = dateKey(date);
              const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
              const classes = [
                'photo-card-calendar-day',
                !isCurrentMonth && 'is-outside',
                key === today && 'is-today',
                key === value && 'is-selected',
              ].filter(Boolean).join(' ');
              return (
                <button
                  type="button"
                  className={classes}
                  key={key}
                  aria-label={`${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`}
                  aria-pressed={key === value}
                  aria-current={key === today ? 'date' : undefined}
                  onClick={() => selectDate(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="photo-card-calendar-footer">
            <button type="button" onClick={() => selectDate(new Date())}>오늘</button>
            <button type="button" onClick={clearDate}>지우기</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function rasterizeSvg(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || 1080;
      canvas.height = image.naturalHeight || 1350;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('이미지를 준비하지 못했어요.'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('PNG 이미지를 만들지 못했어요.'));
      }, 'image/png');
    };
    image.onerror = () => reject(new Error('포토카드 미리보기를 불러오지 못했어요.'));
    image.src = url;
  });
}

function safeFileName(value) {
  const name = String(value || 'escape-record')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/gu, '-')
    .replace(/\s+/gu, '-')
    .replace(/-+/gu, '-')
    .slice(0, 48);
  return (name || 'escape-record') + '-포토카드.png';
}

export default function PhotoCardDialog({ theme, onClose }) {
  const [playedOn, setPlayedOn] = useState('');
  const [remainingMinutes, setRemainingMinutes] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState('');
  const [hintCount, setHintCount] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [review, setReview] = useState('');
  const [escapeResult, setEscapeResult] = useState('');
  const [showThemeName, setShowThemeName] = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [pngBlob, setPngBlob] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isPreparingPng, setIsPreparingPng] = useState(false);
  const [actionBusy, setActionBusy] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const dialogRef = useRef(null);
  const previewPanelRef = useRef(null);
  const imageUrlRef = useRef('');
  const generatedRecordKeyRef = useRef('');
  const requestRef = useRef(null);
  const mountedRef = useRef(false);
  const currentRecordKey = JSON.stringify([playedOn, remainingMinutes, remainingSeconds, hintCount, playerName, review, escapeResult, showThemeName]);
  const imageIsCurrent = Boolean(imageUrl) && generatedRecordKeyRef.current === currentRecordKey;

  useEffect(() => {
    mountedRef.current = true;
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      mountedRef.current = false;
      window.cancelAnimationFrame(frame);
      requestRef.current?.abort();
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    };
  }, []);

  function onDialogKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dialogRef.current.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]',
    )].filter((item) => item.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      event.stopPropagation();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      event.stopPropagation();
      first.focus();
    }
  }

  async function generateCard(event) {
    event.preventDefault();
    setIsCreating(true);
    setIsPreparingPng(false);
    setError('');
    setFeedback('');
    setPngBlob(null);
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const svgBlob = await createPhotoCard(theme.refId, {
        playedOn,
        remainingTime: remainingMinutes !== '' || remainingSeconds !== ''
          ? `${Number(remainingMinutes || 0)}분 ${String(Number(remainingSeconds || 0)).padStart(2, '0')}초`
          : '',
        hintCount,
        playerName: playerName.trim(),
        review: review.trim(),
        escapeResult,
        showThemeName,
      }, controller.signal);
      const nextImageUrl = URL.createObjectURL(svgBlob);
      if (!mountedRef.current) {
        URL.revokeObjectURL(nextImageUrl);
        return;
      }
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = nextImageUrl;
      generatedRecordKeyRef.current = currentRecordKey;
      setImageUrl(nextImageUrl);
      setIsPreparingPng(true);
      const nextPngBlob = await rasterizeSvg(nextImageUrl);
      if (mountedRef.current) {
        setPngBlob(nextPngBlob);
        if (window.matchMedia('(max-width: 700px)').matches) {
          window.requestAnimationFrame(() => previewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
        }
      }
    } catch (cause) {
      if (cause?.name !== 'AbortError' && mountedRef.current) setError(cause.message || '포토카드를 만들지 못했어요.');
    } finally {
      if (mountedRef.current) {
        setIsCreating(false);
        setIsPreparingPng(false);
      }
    }
  }

  function saveCard() {
    if (!pngBlob || !imageIsCurrent) return;
    setActionBusy('save');
    setFeedback('');
    const downloadUrl = URL.createObjectURL(pngBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = safeFileName(theme.name);
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000);
    setFeedback('포토카드를 저장했어요.');
    setActionBusy('');
  }

  async function copyCard() {
    if (!pngBlob || !imageIsCurrent) return;
    setActionBusy('copy');
    setFeedback('');
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('이 브라우저는 이미지 복사를 지원하지 않아요. 저장 버튼을 이용해 주세요.');
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      setFeedback('포토카드를 복사했어요. 원하는 곳에 붙여넣어 보세요.');
    } catch (cause) {
      setError(cause.message || '포토카드를 복사하지 못했어요.');
    } finally {
      setActionBusy('');
    }
  }

  const ready = Boolean(imageIsCurrent && pngBlob && !isCreating && !isPreparingPng);
  const dialog = (
    <div className="photo-card-backdrop" onMouseDown={(event) => {
      event.stopPropagation();
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className="photo-card-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-card-title"
        tabIndex="-1"
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <header className="photo-card-header">
          <div className="photo-card-heading-icon"><Camera size={19} /></div>
          <div>
            <p className="photo-card-eyebrow">방탈출 플레이 기록</p>
            <h2 id="photo-card-title">플레이 포토카드</h2>
          </div>
          <button type="button" className="icon-button photo-card-close" onClick={onClose} aria-label="포토카드 만들기 닫기">
            <X size={19} />
          </button>
        </header>

        <div className="photo-card-body">
          <form className="photo-card-form" onSubmit={generateCard}>
            <div className="photo-card-form-intro">
              <p>플레이 기록을 더해 오늘의 탈출을 한 장으로 남겨보세요.</p>
            </div>
            <p className="photo-card-optional-note">기록과 후기는 선택 입력이에요. 비워둔 항목은 카드에 표시되지 않아요.</p>

            <label className="photo-card-name-option">
              <input type="checkbox" checked={showThemeName} onChange={(event) => setShowThemeName(event.target.checked)} />
              <span className="photo-card-name-check"><Check size={14} /></span>
              <span className="photo-card-name-option-copy">
                <strong>테마 이름 표시</strong>
                <small>포스터에 테마 제목을 함께 담아요</small>
              </span>
            </label>

            <div className="photo-card-field">
              <span>탈출 결과 <em>선택</em></span>
              <div className="photo-card-result-options" role="group" aria-label="탈출 결과 선택">
                <button
                  type="button"
                  className={`photo-card-choice-button photo-card-result-choice${escapeResult === 'success' ? ' is-success' : ''}`}
                  aria-pressed={escapeResult === 'success'}
                  onClick={() => setEscapeResult(escapeResult === 'success' ? '' : 'success')}
                >
                  <Check size={16} aria-hidden="true" />
                  탈출 성공
                </button>
                <button
                  type="button"
                  className={`photo-card-choice-button photo-card-result-choice${escapeResult === 'fail' ? ' is-fail' : ''}`}
                  aria-pressed={escapeResult === 'fail'}
                  onClick={() => setEscapeResult(escapeResult === 'fail' ? '' : 'fail')}
                >
                  <X size={16} aria-hidden="true" />
                  탈출 실패
                </button>
              </div>
            </div>

            <div className="photo-card-field">
              <span>플레이 일자 <em>선택</em></span>
              <CalendarPicker value={playedOn} onChange={setPlayedOn} />
            </div>
            <div className="photo-card-field">
              <span>남은 시간 <em>선택</em></span>
              <div className="photo-card-time-inputs" role="group" aria-label="남은 시간 입력">
                <label className="photo-card-time-choice">
                  <span className="sr-only">분</span>
                  <input type="number" min="0" max="120" step="1" inputMode="numeric" placeholder="00" value={remainingMinutes} onChange={(event) => setRemainingMinutes(event.target.value)} aria-label="남은 시간 분" />
                  <span className="photo-card-time-unit" aria-hidden="true">분</span>
                </label>
                <b aria-hidden="true">:</b>
                <label className="photo-card-time-choice">
                  <span className="sr-only">초</span>
                  <input type="number" min="0" max="59" step="1" inputMode="numeric" placeholder="00" value={remainingSeconds} onChange={(event) => setRemainingSeconds(event.target.value)} aria-label="남은 시간 초" />
                  <span className="photo-card-time-unit" aria-hidden="true">초</span>
                </label>
              </div>
            </div>
            <label className="photo-card-field">
              <span>힌트 사용 수 <em>선택</em></span>
              <div className="photo-card-input-unit">
                <input
                  type="number"
                  value={hintCount}
                  onChange={(event) => setHintCount(event.target.value)}
                  placeholder="0"
                  min="0"
                  max="99"
                  step="1"
                  inputMode="numeric"
                />
                <span>개</span>
              </div>
            </label>
            <label className="photo-card-field">
              <span>플레이어 이름 <em>선택</em></span>
              <input
                type="text"
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                placeholder="카드에 남길 이름"
                maxLength={24}
                autoComplete="nickname"
              />
            </label>
            <label className="photo-card-field">
              <span>후기 <em>선택</em></span>
              <textarea
                value={review}
                onChange={(event) => setReview(event.target.value)}
                placeholder="기억에 남는 장면이나 오늘의 소감을 적어보세요."
                maxLength={320}
                rows={4}
              />
            </label>

            {error ? <p className="photo-card-error" role="alert">{error}</p> : null}
            <button type="submit" className="button button-primary photo-card-generate" disabled={isCreating || isPreparingPng}>
              {isCreating || isPreparingPng
                ? <><LoaderCircle size={16} className="photo-card-spinner" />{isCreating ? '포토카드를 만드는 중' : '이미지를 준비하는 중'}</>
                : <><Camera size={16} />{imageUrl ? '입력 내용 반영해 다시 만들기' : '포토카드 생성'}</>}
            </button>
          </form>

          <section className="photo-card-preview-panel" aria-label="포토카드 미리보기" ref={previewPanelRef}>
            <div className="photo-card-preview-topline">
              <span>미리보기</span>
              <span>{imageUrl && imageIsCurrent ? '생성된 카드' : '플레이 기록'}</span>
            </div>
            <div className={imageUrl ? 'photo-card-preview is-ready' : 'photo-card-preview'}>
              {imageUrl ? (
                <img src={imageUrl} alt={theme.name + ' 포토카드 미리보기'} />
              ) : (
                <div className="photo-card-preview-empty">
                  <span className="photo-card-preview-mark"><Camera size={25} /></span>
                  <strong>오늘의<br />방탈출 기록</strong>
                  <span>포스터와 플레이 기록으로<br />나만의 카드를 만들어요</span>
                </div>
              )}
            </div>
            <div className="photo-card-output">
              <button type="button" className="button button-secondary" onClick={saveCard} disabled={!ready || Boolean(actionBusy)}>
                {actionBusy === 'save' ? <LoaderCircle size={16} className="photo-card-spinner" /> : <Download size={16} />}
                이미지 저장
              </button>
              <button type="button" className="button button-secondary" onClick={copyCard} disabled={!ready || Boolean(actionBusy)}>
                {actionBusy === 'copy' ? <LoaderCircle size={16} className="photo-card-spinner" /> : <Clipboard size={16} />}
                이미지 복사
              </button>
            </div>
            {isPreparingPng ? <p className="photo-card-status" role="status">저장과 복사를 위해 이미지를 준비하고 있어요.</p> : null}
            {imageUrl && !imageIsCurrent ? <p className="photo-card-status">입력을 바꿨어요. 다시 생성하면 새 기록이 반영돼요.</p> : null}
            {feedback ? <p className="photo-card-success" role="status"><Check size={14} />{feedback}</p> : null}
          </section>
        </div>
      </section>
    </div>
  );

  return createPortal(dialog, document.body);
}
