import { useCallback, useState } from 'react';

const BANK_NAME = 'Ngân Hàng Á Châu (ACB)';
const ACCOUNT_NAME = 'LƯU XUÂN LƯỢNG';
const ACCOUNT_NUMBER = '195232659';
const TRANSFER_NOTE = 'Tự Động';

const PLANS = [
  {
    id: 'u1',
    title: 'Unlimited 1',
    concurrent: 1,
    maxPrompt: 199,
    price: 495_000,
    priceDisplay: '495.000',
  },
  {
    id: 'u3',
    title: 'Unlimited 3',
    concurrent: 3,
    maxPrompt: 289,
    price: 697_000,
    priceDisplay: '697.000',
  },
  {
    id: 'u9',
    title: 'Unlimited 9',
    concurrent: 9,
    maxPrompt: 389,
    price: 1_377_000,
    priceDisplay: '1.377.000',
  },
];

function formatMoneyVnd(n) {
  return `${n.toLocaleString('vi-VN')} VNĐ`;
}

export default function ServicePlansPanel() {
  const [payPlan, setPayPlan] = useState(null);

  const openPay = useCallback((plan) => {
    setPayPlan(plan);
  }, []);

  const closePay = useCallback(() => setPayPlan(null), []);

  const qrSrc =
    payPlan != null
      ? `https://img.vietqr.io/image/ACB-${ACCOUNT_NUMBER}-compact2.png?amount=${payPlan.price}&addInfo=${encodeURIComponent(TRANSFER_NOTE)}`
      : '';

  return (
    <div className="service-plans-root">
      <div className="service-plans-header">
        <h2 className="service-plans-title">Chọn gói cước phù hợp</h2>
        <p className="service-plans-sub">Veo3 Pro — nâng cấp gói để mở hạn mức theo từng gói (thanh toán chuyển khoản).</p>
      </div>

      <div className="service-plans-grid">
        {PLANS.map((p) => (
          <article key={p.id} className="service-plan-card">
            <h3 className="service-plan-card-title">{p.title}</h3>
            <ul className="service-plan-features">
              <li className="service-plan-pill service-plan-pill--time">
                <span className="service-plan-pill-icon" aria-hidden="true">
                  ⏱
                </span>
                Thời gian sử dụng: 30 ngày
              </li>
              <li className="service-plan-pill service-plan-pill--inf">
                <span className="service-plan-pill-icon" aria-hidden="true">
                  ∞
                </span>
                Tạo video không giới hạn
              </li>
              <li className="service-plan-pill service-plan-pill--bolt">
                <span className="service-plan-pill-icon" aria-hidden="true">
                  ⚡
                </span>
                Xử lý {p.concurrent} video cùng lúc
              </li>
              <li className="service-plan-pill service-plan-pill--doc">
                <span className="service-plan-pill-icon" aria-hidden="true">
                  📄
                </span>
                Prompt tối đa/lần: {p.maxPrompt}
              </li>
            </ul>
            <div className="service-plan-price-block">
              <p className="service-plan-price-main">{p.priceDisplay} VNĐ</p>
              <div className="service-plan-price-dash" />
              <p className="service-plan-price-unit">≈ 1 VNĐ / video</p>
            </div>
            <button type="button" className="btn btn-primary service-plan-buy" onClick={() => openPay(p)}>
              Mua Ngay
            </button>
          </article>
        ))}
      </div>

      {payPlan && (
        <div className="service-pay-backdrop" role="presentation" onClick={closePay}>
          <div className="service-pay-modal" role="dialog" aria-labelledby="pay-wait-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="service-pay-close" onClick={closePay} aria-label="Đóng">
              ×
            </button>
            <p id="pay-wait-title" className="service-pay-waiting">
              Đang chờ thanh toán…
            </p>

            <div className="service-pay-layout">
              <div className="service-pay-col service-pay-col--info">
                <section className="service-pay-section">
                  <h4 className="service-pay-section-title">THÔNG TIN GÓI CƯỚC</h4>
                  <p className="service-pay-line">
                    <span className="service-pay-k">Gói:</span>{' '}
                    <strong>{payPlan.title}</strong>
                  </p>
                  <p className="service-pay-line">
                    <span className="service-pay-k">Lượt video:</span> <strong>Không giới hạn</strong>
                  </p>
                  <p className="service-pay-line">
                    <span className="service-pay-k">Thời hạn:</span> <strong>30 ngày</strong>
                  </p>
                </section>

                <hr className="service-pay-hr" />

                <section className="service-pay-section">
                  <h4 className="service-pay-section-title">THÔNG TIN CHUYỂN KHOẢN</h4>
                  <div className="service-pay-amount-box">
                    Số tiền: <strong>{formatMoneyVnd(payPlan.price)}</strong>
                  </div>
                  <p className="service-pay-line">
                    <span className="service-pay-k">Ngân hàng:</span> {BANK_NAME}
                  </p>
                  <p className="service-pay-line">
                    <span className="service-pay-k">Tên tài khoản:</span> <strong>{ACCOUNT_NAME}</strong>
                  </p>
                  <p className="service-pay-line">
                    <span className="service-pay-k">STK:</span> <strong>{ACCOUNT_NUMBER}</strong>
                  </p>
                  <p className="service-pay-line">
                    <span className="service-pay-k">Nội dung chuyển khoản:</span>{' '}
                    <strong className="service-pay-transfer-code">{TRANSFER_NOTE}</strong>
                  </p>
                  <p className="service-pay-footnote">
                    Lưu ý: Vui lòng nhập chính xác nội dung chuyển khoản để hệ thống tự động xác nhận thanh toán.
                  </p>
                </section>
              </div>

              <div className="service-pay-col service-pay-col--qr">
                <h4 className="service-pay-section-title">QUÉT MÃ QR ĐỂ THANH TOÁN</h4>
                <div className="service-pay-qr-wrap">
                  <img className="service-pay-qr-img" src={qrSrc} alt={`QR chuyển khoản ${formatMoneyVnd(payPlan.price)}`} width={220} height={220} />
                </div>
                <p className="service-pay-qr-hint">Sử dụng ứng dụng ngân hàng của bạn để quét mã QR và thanh toán.</p>
              </div>
            </div>

            <div className="service-pay-actions">
              <button type="button" className="btn btn-secondary" onClick={closePay}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
