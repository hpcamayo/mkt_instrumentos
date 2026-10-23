import { Button } from "@/components/ui/button";
import { NoticeIcon, noticeClassName } from "@/components/ui/notice";
import { PageContainer } from "@/components/page-container";
import { ownerNotice, type StoreStatus } from "@/lib/store-storefront";

// shop-04: what the owner of the store sees above their own page. Before approval (or while rejected or hidden) it is a
// private preview: only the owner can open the page, and the notice says so and when it becomes public. On an active
// store it is a short reminder. Both offer "Editar perfil" (Mi tienda). Nobody else ever sees it.
export function StoreOwnerNotice({ status }: { status: StoreStatus }) {
  const notice = ownerNotice(status);
  const tone = notice.preview ? "warning" : "info";
  return (
    <PageContainer className="pt-4">
      <div role={notice.preview ? "status" : "note"} className={noticeClassName(tone, "items-start")}>
        <NoticeIcon tone={tone} />
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0">
            <strong className="font-semibold">{notice.title}.</strong> {notice.text}
          </p>
          <Button href="/mi-cuenta/tienda" variant="secondary" size="sm" className="shrink-0 self-start sm:self-auto">
            Editar perfil
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
