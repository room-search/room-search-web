import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const EFFECTIVE_DATE = '2026년 9월 28일';
const PRIVACY_LAW_URL = 'https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1016143207';
const THEME_KEY = 'room-search.theme.v1';

function LegalFooter({ darkMode, onToggleTheme }) {
  return (
    <footer className="site-footer legal-footer">
      <nav className="footer-policy-links" aria-label="정책 및 앱 안내">
        <a href="/privacy-policy">개인정보처리방침</a>
        <a href="/terms">이용약관</a>
        <a href="https://room-search.github.io/" target="_blank" rel="noopener noreferrer">안드로이드</a>
      </nav>
      <button
        type="button"
        className="footer-theme-button"
        onClick={onToggleTheme}
        aria-label={darkMode ? '라이트 모드로 변경' : '다크 모드로 변경'}
        title={darkMode ? '라이트 모드' : '다크 모드'}
      >
        {darkMode ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </footer>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <p className="legal-lead">
        룸서치는 방탈출 테마를 검색하고 비교하는 데 필요한 정보만 처리합니다. 계정 가입을 받지 않으며,
        찜 목록과 화면 모드는 이용자의 기기에 저장됩니다.
      </p>

      <section className="legal-section">
        <h2>1. 처리하는 정보와 이용 목적</h2>
        <ul>
          <li><strong>검색 정보:</strong> 검색어, 지역, 난이도·공포도·가격·플레이 시간 범위, 정렬 및 페이지 조건을 검색 결과 제공을 위해 처리합니다.</li>
          <li><strong>접속 정보:</strong> 요청 빈도 제한과 서비스 안정성 유지를 위해 접속 IP 주소와 요청 시각을 서버 메모리에서 처리합니다.</li>
          <li><strong>기기 내 저장 정보:</strong> 찜한 테마 정보와 화면 모드 설정을 브라우저의 로컬 저장소에 저장해 다음 방문에도 사용할 수 있게 합니다.</li>
        </ul>
        <p>이름, 이메일, 전화번호, 계정 정보나 기기의 위치 정보는 앱에서 요청하지 않습니다. 찜 목록과 화면 모드는 룸서치 서버로 전송되지 않습니다.</p>
      </section>

      <section className="legal-section">
        <h2>2. 보유 및 이용 기간</h2>
        <ul>
          <li>찜 목록과 화면 모드는 이용자가 브라우저 저장 데이터를 삭제할 때까지 해당 기기에 보관됩니다.</li>
          <li>검색 조건, 접속 정보와 API 응답은 검색 처리, 짧은 시간 동안의 결과 캐시 및 요청 제한을 위해 서버 메모리에서 처리합니다. 별도 데이터베이스에 이용자 검색 기록을 저장하지 않으며 서버 프로세스가 종료되면 메모리 정보는 삭제됩니다.</li>
          <li>검색 결과 캐시는 약 45초, 지역 목록은 약 1시간, 상세 정보는 약 5분 동안 유지됩니다.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>3. 외부 API 이용</h2>
        <p>
          테마·카페 검색 결과를 제공하기 위해 <a href="https://apisis.dev" target="_blank" rel="noopener noreferrer">APISis API</a>를 이용합니다.
          검색어와 지역·점수 등의 검색 조건은 룸서치 서버를 거쳐 API 요청에 포함됩니다. 외부 API 제공자의 데이터 처리는 해당 제공자의 안내와 정책을 따릅니다.
        </p>
      </section>

      <section className="legal-section">
        <h2>4. 쿠키 및 자동 수집 장치</h2>
        <p>룸서치 앱은 광고 목적의 쿠키나 분석 추적 도구를 사용하지 않습니다. 찜 목록과 화면 모드에는 브라우저 로컬 저장소를 사용합니다.</p>
      </section>

      <section className="legal-section">
        <h2>5. 이용자의 권리와 행사 방법</h2>
        <p>
          이용자는 적용되는 법령에 따라 개인정보의 열람, 정정·삭제, 처리정지 등을 요청할 수 있습니다. 찜 목록과 화면 모드는 브라우저의 사이트 데이터 설정에서 직접 삭제할 수 있습니다.
          관련 권리에 대한 자세한 내용은 <a href={PRIVACY_LAW_URL} target="_blank" rel="noopener noreferrer">개인정보 보호법</a>을 확인해 주세요.
        </p>
      </section>

      <section className="legal-section legal-contact">
        <h2>6. 운영자 및 개인정보 문의</h2>
        <p><strong>서비스명:</strong> 룸서치</p>
        <p><strong>운영자:</strong> hshim</p>
        <p><strong>개인정보 문의:</strong> <a href="mailto:ggrteas@gmail.com">ggrteas@gmail.com</a></p>
      </section>
    </>
  );
}

function TermsOfService() {
  return (
    <>
      <p className="legal-lead">
        이 약관은 룸서치가 제공하는 방탈출 테마 검색 서비스의 이용 조건과 기본 사항을 안내합니다.
      </p>

      <section className="legal-section">
        <h2>1. 서비스 내용</h2>
        <p>룸서치는 방탈출 테마와 카페 정보를 검색·비교하고, 테마를 기기에 찜해 둘 수 있는 정보 서비스입니다. 룸서치에서 예약이나 결제를 처리하지 않습니다.</p>
      </section>

      <section className="legal-section">
        <h2>2. 정보의 정확성</h2>
        <p>테마, 가격, 운영 상태, 플레이 시간 및 카페 정보는 외부 API와 정보 제공처의 자료를 바탕으로 표시되며 변경되거나 일부 누락될 수 있습니다. 방문이나 예약 전에 해당 카페에 최신 정보를 확인해 주세요.</p>
      </section>

      <section className="legal-section">
        <h2>3. 이용자의 준수 사항</h2>
        <p>이용자는 관련 법령과 이 약관을 지켜야 하며, 서비스의 정상적인 운영을 방해하거나 서버에 과도한 요청을 보내서는 안 됩니다. 서비스의 보안 기능이나 요청 제한을 우회하거나, 허가 없이 자동화된 방식으로 정보를 수집하는 행위도 금지됩니다.</p>
      </section>

      <section className="legal-section">
        <h2>4. 찜 목록과 기기 저장</h2>
        <p>찜 목록과 화면 모드는 이용자의 브라우저에 저장됩니다. 브라우저 데이터 삭제, 기기 변경 또는 저장 공간 정리에 따라 저장 내용이 사라질 수 있으며, 룸서치는 이를 서버에 백업하지 않습니다.</p>
      </section>

      <section className="legal-section">
        <h2>5. 외부 서비스와 콘텐츠</h2>
        <p>외부 API, 카페 예약 페이지 및 전화 연결은 각 제공자의 서비스와 정책을 따릅니다. 외부 서비스 이용 중 발생한 예약·결제·방문 관련 사항은 해당 카페 또는 서비스 제공자에게 확인해 주세요. 각 콘텐츠의 권리는 해당 권리자에게 있습니다.</p>
      </section>

      <section className="legal-section">
        <h2>6. 서비스 변경과 중단</h2>
        <p>룸서치는 기능 개선, 점검, 외부 API 장애 또는 운영상 필요에 따라 서비스의 일부를 변경하거나 일시 중단할 수 있습니다. 중요한 변경 사항은 서비스 화면을 통해 안내합니다.</p>
      </section>

      <section className="legal-section">
        <h2>7. 약관 변경 및 준거법</h2>
        <p>약관을 변경하면 적용일과 변경 내용을 서비스 화면에 안내합니다. 서비스 이용에는 대한민국 법령을 적용하며, 분쟁은 관련 법령이 정하는 절차에 따릅니다.</p>
      </section>

      <section className="legal-section">
        <h2>8. 운영자 및 문의</h2>
        <p><strong>운영자:</strong> hshim · <a href="mailto:ggrteas@gmail.com">ggrteas@gmail.com</a></p>
      </section>
    </>
  );
}

export default function LegalPage({ page }) {
  const isPrivacy = page === 'privacy';
  const title = isPrivacy ? '개인정보처리방침' : '이용약관';
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const previousTitle = document.title;
    document.title = title + ' | 룸서치';
    return () => { document.title = previousTitle; };
  }, [title]);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    try {
      localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // Theme selection still applies for the current page when storage is unavailable.
    }
  }, [darkMode]);

  return (
    <div className="app-shell legal-page">
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="/" aria-label="룸서치 홈">
            <img src="/room-search-icon.png" alt="" width="37" height="37" />
            <span className="brand-word">룸서치</span>
          </a>
          <a className="legal-home-link" href="/">검색으로 돌아가기</a>
        </div>
      </header>

      <main className="legal-main">
        <article className="legal-document">
          <p className="legal-eyebrow">ROOM SEARCH · 안내</p>
          <h1>{title}</h1>
          <p className="legal-effective-date">시행일 {EFFECTIVE_DATE}</p>
          {isPrivacy ? <PrivacyPolicy /> : <TermsOfService />}
        </article>
      </main>

      <LegalFooter darkMode={darkMode} onToggleTheme={() => setDarkMode((current) => !current)} />
    </div>
  );
}
