export const eventList = (
  items = '<a href="./clinicView.php?i=101&cate=20"><div class="Name">시험 이벤트</div></a>',
  pages = "",
) =>
  `<div id="contents"><section id="ClinicCateList"><a href="/clinicPrice/eventListLeft.php?cate=20"><span>시험 이벤트</span></a><a href="/clinicPrice/eventListLeft.php?cate=30">일반 가격표</a></section><section class="ClinicAllList">${items}</section>${pages}</div>`;
export const eventDetail = (
  sale = "80,000원",
  period = "2026-09-01 ~ 2026-09-30",
  extra = "",
) =>
  `<div id="contents"><section class="ClinicTop"><div class="MainTitle"><a href="/clinicPrice/eventListLeft.php?cate=20">시험 이벤트</a></div></section><section class="ClinicDetail"><div class="ClinicInfo"><div class="Name">시험 이벤트</div><div class="Info">설명 &amp; 안내</div><div class="Date">${period}</div></div><img src="/uploadFiles/C00269/clinicEventImg/test.png"><img src="/uploadFiles/C00269/clinicEventImg/test.png"><img src="https://evil.example/uploadFiles/a.png"><script>ignore()</script><section class="ClinicDetailSelect"><input name="idx" value="101"><ul><li class="ListBox"><div class="Name">테스트 시술 1회</div><div class="Info">조건 확인 · VAT 별도</div><div class="Price"><span alt="할인가"><b>${sale}</b></span><em alt="정가">100,000원</em><small alt="할인율">20%</small></div><input name="idxChk[]" value="201"></li>${extra}</ul></section></section></div>`;
