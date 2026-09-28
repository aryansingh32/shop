/**
 * True one-tap customer creation from the POS customer search screen.
 *
 * Product ask: "shop owner just needs to enter their name and mobile and
 * it's created, or can search by name or mobile — if found, all good; if
 * not, directly create with one click, just need to enter name."
 *
 * The Name+Phone quick-create form (pos_partner_quickform.xml) already cut
 * Odoo's full Contacts form down to two fields. This goes one step further:
 * when a search finds no match, a button appears offering to create a
 * customer with the typed text as their name, in the same screen, with a
 * single tap — no separate form at all. Phone/further details can still be
 * added later via the pencil-edit icon on that customer's row, which opens
 * the same fast Name+Phone form.
 *
 * this.pos.data.create() is POS's own local-first create path (same one
 * every other POS screen uses to create records without a full page
 * round trip) — verified against data_service.js: create(model, values,
 * queue) expects values as an array of dicts and returns the newly loaded
 * local record(s) ready to use immediately, same shape editPartner() hands
 * to clickPartner() today.
 */
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { PartnerList } from "@point_of_sale/app/screens/partner_list/partner_list";

patch(PartnerList.prototype, {
    get canQuickCreatePartner() {
        const query = (this.state.query || "").trim();
        return query.length > 0 && this.getPartners().length === 0;
    },

    async quickCreatePartner() {
        const name = (this.state.query || "").trim();
        if (!name) {
            return;
        }
        try {
            const created = await this.pos.data.create("res.partner", [{ name }]);
            const partner = Array.isArray(created) ? created[0] : created;
            if (partner) {
                this.clickPartner(partner);
            }
        } catch (err) {
            this.notification.add(_t("Couldn't create the customer. Please try again."), 3000);
            console.error("[quickCreatePartner] Failed to create customer:", err);
        }
    },
});
