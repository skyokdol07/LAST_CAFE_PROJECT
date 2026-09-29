/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from './lib/supabase';
import {
  DRINK_MENU,
  SIZE_OPTIONS,
  EXTRA_OPTIONS,
  CafeOrder,
} from './data/cafeData';
import {
  Coffee,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ClipboardList,
} from 'lucide-react';

type Tab = 'order' | 'history';

export default function App() {
  // ==========================================
  // 탭 상태
  // ==========================================
  const [activeTab, setActiveTab] = useState<Tab>('order');

  // ==========================================
  // 1. 주문서 폼 상태(State) 관리
  // ==========================================

  // 주문자 이름 (필수, 텍스트)
  const [customerName, setCustomerName] = useState<string>('');

  // 전화번호 (선택, tel)
  const [phoneNumber, setPhoneNumber] = useState<string>('');

  // 선택된 음료 ID (드롭다운, 기본값은 빈 문자열)
  const [selectedDrinkId, setSelectedDrinkId] = useState<string>('');

  // 선택된 사이즈 ('S' | 'M' | 'L', 기본값: 'M')
  const [selectedSize, setSelectedSize] = useState<'S' | 'M' | 'L'>('M');

  // 선택된 추가 옵션 ID 배열 (체크박스)
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

  // 수량 (number, 1 ~ 10, 기본값: 1)
  const [quantity, setQuantity] = useState<number>(1);

  // 요청사항 (textarea)
  const [specialRequests, setSpecialRequests] = useState<string>('');

  // 유효성 검사 에러 메시지 상태
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 주문 접수 성공 확인 메시지 상태
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 최근 접수된 주문 목록
  const [orderList, setOrderList] = useState<CafeOrder[]>([]);

  // 로딩 / 제출 중 상태
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // ==========================================
  // Supabase: 초기 주문 목록 불러오기 + Realtime 구독
  // ==========================================
  useEffect(() => {
    // 1) 기존 주문 전체 불러오기 (최신순)
    const fetchOrders = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        const mapped: CafeOrder[] = data.map((row: any) => ({
          id: String(row.id),
          customerName: row.customer_name,
          phone: row.phone ?? '',
          drinkName: row.drink_name,
          drinkPrice: row.drink_price,
          size: row.size,
          sizePrice: row.size_price,
          options: row.options ?? [],
          optionsPrice: row.options_price,
          quantity: row.quantity,
          requests: row.requests ?? '',
          totalPrice: row.total_price,
          createdAt: new Date(row.created_at).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        }));
        setOrderList(mapped);
      }
      setIsLoading(false);
    };

    fetchOrders();

    // 2) Realtime 구독 — 새 주문 INSERT 시 자동 반영
    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const row = payload.new as any;
          const newOrder: CafeOrder = {
            id: String(row.id),
            customerName: row.customer_name,
            phone: row.phone ?? '',
            drinkName: row.drink_name,
            drinkPrice: row.drink_price,
            size: row.size,
            sizePrice: row.size_price,
            options: row.options ?? [],
            optionsPrice: row.options_price,
            quantity: row.quantity,
            requests: row.requests ?? '',
            totalPrice: row.total_price,
            createdAt: new Date(row.created_at).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
          };
          setOrderList((prev) => [newOrder, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ==========================================
  // 2. 실시간 예상 금액 계산 (useMemo 활용)
  // ==========================================

  // 선택된 음료 객체 조회
  const currentDrink = useMemo(() => {
    return DRINK_MENU.find((d) => d.id === selectedDrinkId);
  }, [selectedDrinkId]);

  // 선택된 사이즈 객체 조회
  const currentSize = useMemo(() => {
    return SIZE_OPTIONS.find((s) => s.id === selectedSize) || SIZE_OPTIONS[1];
  }, [selectedSize]);

  // 선택된 추가 옵션들의 총 추가 금액 계산
  const optionsExtraTotal = useMemo(() => {
    return selectedOptions.reduce((acc, optId) => {
      const option = EXTRA_OPTIONS.find((o) => o.id === optId);
      return acc + (option ? option.price : 0);
    }, 0);
  }, [selectedOptions]);

  // 잔당 단가 (음료 기본가 + 사이즈 추가금 + 옵션 추가금)
  const pricePerCup = useMemo(() => {
    const baseDrinkPrice = currentDrink ? currentDrink.price : 0;
    return baseDrinkPrice + currentSize.extraPrice + optionsExtraTotal;
  }, [currentDrink, currentSize, optionsExtraTotal]);

  // 최종 예상 총 금액 = 잔당 단가 × 수량
  const calculatedTotalPrice = useMemo(() => {
    return pricePerCup * quantity;
  }, [pricePerCup, quantity]);

  // ==========================================
  // 3. 이벤트 핸들러 함수들
  // ==========================================

  // 체크박스 옵션 토글 핸들러
  const handleOptionToggle = (optionId: string) => {
    setSelectedOptions((prev) =>
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId]
    );
  };

  // 수량 변경 핸들러 (최소 1, 최대 10 유지)
  const handleQuantityChange = (val: number) => {
    if (isNaN(val)) {
      setQuantity(1);
      return;
    }
    const clamped = Math.max(1, Math.min(10, val));
    setQuantity(clamped);
  };

  // 다시 작성 (초기화) 버튼 핸들러
  const handleReset = () => {
    setCustomerName('');
    setPhoneNumber('');
    setSelectedDrinkId('');
    setSelectedSize('M');
    setSelectedOptions([]);
    setQuantity(1);
    setSpecialRequests('');
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // 주문하기 버튼 클릭 핸들러
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // [유효성 검사 1] 이름이 비어있는 경우
    if (!customerName.trim()) {
      setErrorMessage('이름을 입력해주세요');
      return;
    }

    // [유효성 검사 2] 음료를 선택하지 않은 경우
    if (!selectedDrinkId || !currentDrink) {
      setErrorMessage('음료를 선택해주세요');
      return;
    }

    // 선택된 추가 옵션 이름 텍스트 가공
    const selectedOptionNames = selectedOptions
      .map((optId) => EXTRA_OPTIONS.find((o) => o.id === optId)?.name)
      .filter(Boolean) as string[];

    // 옵션 표시 문자열 생성
    const optionsText =
      selectedOptionNames.length > 0
        ? ` (${selectedOptionNames.join(', ')})`
        : '';

    setIsSubmitting(true);

    // Supabase orders 테이블에 INSERT
    const { error } = await supabase.from('orders').insert({
      customer_name: customerName.trim(),
      phone: phoneNumber.trim() || null,
      drink_name: currentDrink.name,
      drink_price: currentDrink.price,
      size: currentSize.id,
      size_price: currentSize.extraPrice,
      options: selectedOptionNames,
      options_price: optionsExtraTotal,
      quantity: quantity,
      requests: specialRequests.trim() || null,
      total_price: calculatedTotalPrice,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(`주문 저장 실패: ${error.message}`);
      return;
    }

    // 주문 확인 메시지 텍스트 조합
    const confirmationText = `${customerName.trim()}님, ${currentDrink.name} ${currentSize.name}사이즈${optionsText} ${quantity}잔, 총 ${calculatedTotalPrice.toLocaleString()}원 주문이 접수되었습니다!`;

    setSuccessMessage(confirmationText);

    // 폼 초기화
    setCustomerName('');
    setPhoneNumber('');
    setSelectedDrinkId('');
    setSelectedSize('M');
    setSelectedOptions([]);
    setQuantity(1);
    setSpecialRequests('');

    // 주문 내역 탭으로 전환
    setActiveTab('history');
  };

  // ==========================================
  // 렌더링
  // ==========================================
  return (
    <div className="min-h-screen bg-[#faf6f0] text-[#3b281c] py-8 px-4 font-['맑은_고딕','Malgun_Gothic','Pretendard',sans-serif]">
      <div className="max-w-[520px] mx-auto">

        {/* ==================================================== */}
        {/* [페이지 상단] 로고 및 카페 타이틀 */}
        {/* ==================================================== */}
        <header className="text-center pb-5 mb-0">
          <div className="text-6xl mb-2 select-none transform hover:scale-105 transition-transform inline-block">
            ☕
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#6b4226] tracking-tight">
            바이브 카페
          </h1>
          <p className="text-sm sm:text-base text-[#8c674b] mt-1 font-medium">
            당신의 하루에 바이브를 더하다
          </p>
        </header>

        {/* ==================================================== */}
        {/* 탭 네비게이션 */}
        {/* ==================================================== */}
        <div className="flex mt-5 mb-0 bg-[#f0e7dc] rounded-xl p-1 gap-1">
          <button
            type="button"
            onClick={() => { setActiveTab('order'); setSuccessMessage(null); setErrorMessage(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'order'
                ? 'bg-white text-[#6b4226] shadow-sm'
                : 'text-[#8c674b] hover:text-[#6b4226]'
            }`}
          >
            <Coffee className="w-4 h-4" />
            주문하기
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'history'
                ? 'bg-white text-[#6b4226] shadow-sm'
                : 'text-[#8c674b] hover:text-[#6b4226]'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            주문 내역
            {orderList.length > 0 && (
              <span className="bg-[#6b4226] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {orderList.length}
              </span>
            )}
          </button>
        </div>

        {/* ==================================================== */}
        {/* 탭 콘텐츠 */}
        {/* ==================================================== */}

        {/* ── 주문하기 탭 ── */}
        {activeTab === 'order' && (
          <main className="bg-white rounded-2xl shadow-md border border-[#e8dfd3] p-6 sm:p-8 mt-3">

            {/* 유효성 검사 에러 알림창 */}
            {errorMessage && (
              <div
                role="alert"
                className="mb-5 p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2.5 text-sm font-medium"
              >
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* ==================================================== */}
            {/* [주문서 항목 양식 (Form)] */}
            {/* ==================================================== */}
            <form onSubmit={handleSubmitOrder} className="space-y-5" noValidate>

              {/* 1. 이름 (필수, text) */}
              <div>
                <label
                  htmlFor="customer-name-input"
                  className="block text-sm font-bold text-[#54341e] mb-1.5"
                >
                  이름 <span className="text-red-500 font-bold">*</span>
                </label>
                <input
                  id="customer-name-input"
                  type="text"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    if (errorMessage && e.target.value.trim()) {
                      setErrorMessage(null);
                    }
                  }}
                  placeholder="주문하시는 분의 성함을 입력해주세요"
                  className="cafe-input w-full p-[10px] rounded-[8px] border border-[#d5c6b6] bg-[#fffdfa] text-[#3b281c] text-sm placeholder-[#ad9d8f] transition"
                  required
                />
              </div>

              {/* 2. 전화번호 (tel) */}
              <div>
                <label
                  htmlFor="customer-phone-input"
                  className="block text-sm font-bold text-[#54341e] mb-1.5"
                >
                  전화번호
                </label>
                <input
                  id="customer-phone-input"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="예: 010-1234-5678"
                  className="cafe-input w-full p-[10px] rounded-[8px] border border-[#d5c6b6] bg-[#fffdfa] text-[#3b281c] text-sm placeholder-[#ad9d8f] transition"
                />
              </div>

              {/* 3. 음료 선택 (드롭다운) */}
              <div>
                <label
                  htmlFor="drink-select-box"
                  className="block text-sm font-bold text-[#54341e] mb-1.5"
                >
                  음료 선택 <span className="text-red-500 font-bold">*</span>
                </label>
                <div className="relative">
                  <select
                    id="drink-select-box"
                    value={selectedDrinkId}
                    onChange={(e) => {
                      setSelectedDrinkId(e.target.value);
                      if (errorMessage && e.target.value) {
                        setErrorMessage(null);
                      }
                    }}
                    className="cafe-input w-full p-[10px] pr-10 rounded-[8px] border border-[#d5c6b6] bg-[#fffdfa] text-[#3b281c] text-sm appearance-none cursor-pointer transition font-medium"
                  >
                    <option value="">-- 음료를 선택해주세요 --</option>
                    {DRINK_MENU.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.price.toLocaleString()}원)
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#6b4226]">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* 4. 사이즈 (라디오 버튼, 가로 배치) */}
              <div>
                <label className="block text-sm font-bold text-[#54341e] mb-1.5">
                  사이즈 선택
                </label>
                <div className="flex flex-row flex-wrap items-center gap-3">
                  {SIZE_OPTIONS.map((size) => {
                    const isSelected = selectedSize === size.id;
                    return (
                      <label
                        key={size.id}
                        htmlFor={`size-option-${size.id}`}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm font-medium transition ${
                          isSelected
                            ? 'border-[#6b4226] bg-[#fbf5ee] text-[#6b4226] shadow-xs'
                            : 'border-[#dfd2c4] bg-white text-[#5c493c] hover:bg-[#faf6f1]'
                        }`}
                      >
                        <input
                          type="radio"
                          id={`size-option-${size.id}`}
                          name="cafe-size-group"
                          value={size.id}
                          checked={isSelected}
                          onChange={() => setSelectedSize(size.id)}
                          className="accent-[#6b4226] w-4 h-4 cursor-pointer"
                        />
                        <span>
                          {size.name}{' '}
                          <span className="text-xs text-[#8c674b]">
                            (+{size.extraPrice.toLocaleString()}원)
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 5. 추가 옵션 (체크박스, 가로 배치) */}
              <div>
                <label className="block text-sm font-bold text-[#54341e] mb-1.5">
                  추가 옵션
                </label>
                <div className="flex flex-row flex-wrap items-center gap-2.5">
                  {EXTRA_OPTIONS.map((option) => {
                    const isChecked = selectedOptions.includes(option.id);
                    return (
                      <label
                        key={option.id}
                        htmlFor={`extra-option-${option.id}`}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition ${
                          isChecked
                            ? 'border-[#6b4226] bg-[#fbf5ee] text-[#6b4226] font-semibold shadow-xs'
                            : 'border-[#dfd2c4] bg-white text-[#5c493c] hover:bg-[#faf6f1]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          id={`extra-option-${option.id}`}
                          checked={isChecked}
                          onChange={() => handleOptionToggle(option.id)}
                          className="accent-[#6b4226] w-4 h-4 cursor-pointer rounded"
                        />
                        <span>
                          {option.name}{' '}
                          <span className="text-xs text-[#8c674b]">
                            (+{option.price.toLocaleString()}원)
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 6. 수량 (number 타입, 최소 1, 최대 10, 기본값 1) */}
              <div>
                <label
                  htmlFor="order-quantity-input"
                  className="block text-sm font-bold text-[#54341e] mb-1.5"
                >
                  수량 (최소 1잔 ~ 최대 10잔)
                </label>
                <div className="flex items-center gap-2 max-w-[200px]">
                  <button
                    type="button"
                    onClick={() => handleQuantityChange(quantity - 1)}
                    disabled={quantity <= 1}
                    className="w-10 h-10 flex items-center justify-center rounded-lg border border-[#d5c6b6] bg-[#faf6f0] hover:bg-[#efe7dc] disabled:opacity-40 text-lg font-bold text-[#6b4226] transition"
                    aria-label="수량 감소"
                  >
                    -
                  </button>
                  <input
                    id="order-quantity-input"
                    type="number"
                    min={1}
                    max={10}
                    value={quantity}
                    onChange={(e) => handleQuantityChange(parseInt(e.target.value, 10))}
                    className="cafe-input w-full p-[10px] rounded-[8px] border border-[#d5c6b6] bg-[#fffdfa] text-center font-bold text-[#6b4226] text-base"
                  />
                  <button
                    type="button"
                    onClick={() => handleQuantityChange(quantity + 1)}
                    disabled={quantity >= 10}
                    className="w-10 h-10 flex items-center justify-center rounded-lg border border-[#d5c6b6] bg-[#faf6f0] hover:bg-[#efe7dc] disabled:opacity-40 text-lg font-bold text-[#6b4226] transition"
                    aria-label="수량 증가"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 7. 요청사항 (textarea) */}
              <div>
                <label
                  htmlFor="special-requests-input"
                  className="block text-sm font-bold text-[#54341e] mb-1.5"
                >
                  요청사항
                </label>
                <textarea
                  id="special-requests-input"
                  rows={3}
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  placeholder="예: 얼음 조금만 넣어주세요, 시럽 반만 넣어주세요 등"
                  className="cafe-input w-full p-[10px] rounded-[8px] border border-[#d5c6b6] bg-[#fffdfa] text-[#3b281c] text-sm placeholder-[#ad9d8f] resize-none transition"
                />
              </div>

              {/* ==================================================== */}
              {/* [실시간 예상 금액 표시 영역] */}
              {/* ==================================================== */}
              <div className="pt-2 pb-1">
                <div className="bg-[#fcf8f3] rounded-xl border border-[#ede3d5] p-4 text-center">
                  <span className="text-xs uppercase tracking-wider text-[#9d785a] font-semibold block mb-1">
                    Real-time Total Price
                  </span>
                  <div className="text-[24px] font-bold text-[#6b4226] leading-none">
                    예상 금액: {calculatedTotalPrice.toLocaleString()}원
                  </div>
                  <div className="text-xs text-[#8c674b] mt-1.5">
                    {currentDrink ? (
                      <span>
                        ({currentDrink.name} {currentDrink.price.toLocaleString()}원 + 사이즈 {currentSize.extraPrice.toLocaleString()}원 + 옵션 {optionsExtraTotal.toLocaleString()}원) × {quantity}잔
                      </span>
                    ) : (
                      <span className="text-[#a48e7e]">음료를 선택하시면 상세 계산 금액이 반영됩니다.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* ==================================================== */}
              {/* 8. 주문하기 버튼 & 9. 다시 작성 버튼 */}
              {/* ==================================================== */}
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 px-5 rounded-[8px] bg-[#6b4226] hover:bg-[#7f4f2f] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-base transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  <Coffee className="w-5 h-5" />
                  <span>{isSubmitting ? '저장 중...' : '주문하기'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isSubmitting}
                  className="py-3 px-5 rounded-[8px] bg-[#f0e7dc] hover:bg-[#e6dacb] disabled:opacity-60 text-[#6b4226] font-bold text-base border border-[#d6c4b2] transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>다시 작성</span>
                </button>
              </div>
            </form>
          </main>
        )}

        {/* ── 주문 내역 탭 ── */}
        {activeTab === 'history' && (
          <section className="bg-white rounded-2xl shadow-md border border-[#e8dfd3] p-6 sm:p-8 mt-3">

            {/* 주문 완료 알림 (주문 직후 전환 시 표시) */}
            {successMessage && (
              <div
                role="status"
                className="mb-5 p-4 bg-[#eef7ee] border border-[#cbe6cb] text-[#236b2f] rounded-[8px] text-sm leading-relaxed font-semibold flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-5 h-5 text-[#236b2f] shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-[#1b5e20] mb-0.5">주문 완료 🎉</p>
                  <p className="font-medium text-[#236b2f]">{successMessage}</p>
                </div>
              </div>
            )}

            {/* 헤더 */}
            <div className="flex items-center justify-between pb-3 border-b border-[#f0e8de] mb-4">
              <h2 className="text-base font-bold text-[#6b4226] flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>주문 현황 ({orderList.length}건)</span>
              </h2>
              <span className="text-xs bg-[#f4ebe1] text-[#6b4226] px-2 py-0.5 rounded-full font-medium">
                🔴 실시간 접수 보드
              </span>
            </div>

            {/* 로딩 중 */}
            {isLoading && (
              <div className="flex items-center justify-center py-12 text-[#8c674b] text-sm gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-[#6b4226] border-t-transparent rounded-full"></span>
                <span>주문 내역 불러오는 중...</span>
              </div>
            )}

            {/* 주문 없음 */}
            {!isLoading && orderList.length === 0 && (
              <div className="flex flex-col items-center justify-center py-14 text-[#ad9d8f] gap-3">
                <ClipboardList className="w-12 h-12 opacity-30" />
                <p className="text-sm font-medium">아직 접수된 주문이 없습니다.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('order')}
                  className="mt-1 text-xs text-[#6b4226] underline underline-offset-2 font-semibold"
                >
                  주문하러 가기 →
                </button>
              </div>
            )}

            {/* 주문 목록 */}
            {!isLoading && orderList.length > 0 && (
              <div className="space-y-3">
                {orderList.map((order, index) => (
                  <div
                    key={order.id}
                    className="p-3.5 rounded-xl bg-[#faf6f0] border border-[#ebdccf] text-sm space-y-1.5"
                  >
                    {/* 순번 + 이름 + 시간 */}
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-[#54341e] text-base flex items-center gap-1.5">
                        <span className="text-xs bg-[#6b4226] text-white px-1.5 py-0.5 rounded font-bold leading-none">
                          #{orderList.length - index}
                        </span>
                        {order.customerName} 고객님
                        {order.phone && (
                          <span className="text-xs text-[#8c674b] font-normal">
                            ({order.phone})
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-[#8c674b] bg-white px-2 py-0.5 rounded border border-[#e4d5c5]">
                        {order.createdAt}
                      </span>
                    </div>

                    {/* 음료 정보 */}
                    <div className="text-[#3b281c]">
                      <span className="font-semibold text-[#6b4226]">
                        {order.drinkName}
                      </span>{' '}
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[#f0e4d7] text-[#6b4226] font-bold">
                        {order.size}사이즈
                      </span>
                      {order.options.length > 0 && (
                        <span className="text-xs text-[#70503a] ml-1.5">
                          ({order.options.join(', ')})
                        </span>
                      )}
                      <span className="ml-1.5 font-bold">× {order.quantity}잔</span>
                    </div>

                    {/* 요청사항 */}
                    {order.requests && (
                      <div className="text-xs text-[#735a49] bg-white/70 p-2 rounded border border-[#eddccc]">
                        <span className="font-semibold">요청:</span> {order.requests}
                      </div>
                    )}

                    {/* 가격 */}
                    <div className="flex items-center justify-between pt-1 border-t border-[#f0e4d7]/70 text-xs">
                      <span className="text-[#8c674b]">총 결제금액</span>
                      <span className="text-sm font-bold text-[#6b4226]">
                        {order.totalPrice.toLocaleString()}원
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 푸터 영역 */}
        <footer className="text-center mt-6 text-xs text-[#8c674b]">
          © 바이브 카페 (Vibe Cafe). 따뜻한 한 잔의 여유를 전합니다.
        </footer>
      </div>
    </div>
  );
}
