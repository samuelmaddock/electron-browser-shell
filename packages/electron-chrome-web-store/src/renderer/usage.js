r c = {
                showConfirmDialog: !0
            };
            window.chrome && window.chrome.management && window.chrome.management.uninstall && window.chrome.management.uninstall(a, c, b)
        }
        ;

            b = b === void 0 ? null : b;
            return new Promise(function(c) {
                if (!window.chrome || !window.chrome.webstorePrivate || !window.chrome.webstorePrivate.getExtensionStatus)
                    throw Error("Yc");
                window.chrome.webstorePrivate.getExtensionStatus(a, b, function(d) {
                    c(d)
                })

        fqa = function() {
            return new Promise(function(a) {
                window.chrome && window.chrome.management && window.chrome.management.getAll || a([]);
                window.chrome.management.getAll(function(b) {
                    a(b)
a, b))
        }
          , Dw = function() {
            if (!(window.chrome && window.chrome.runtime && window.chrome.runtime.getManifest && window.chrome.runtime.getManifest()))
                throw Error("Ib");
        };
;
            this.Hc = a.service.YB;
            this.j = a.service.Vn;
            this.Aa = this.chrome.j;
            this.oa = _.Hh(b);
            this.o = null;
X.bind(this || null));
            this.Da = 0;
            this.iJ = a.service.window;
            a = this.chrome.window.get();
            a.history && a.history.scrollRestoration && (b = Object.getPrototypeOf(a.history),
            b != null && (b 

        z0 = function(a, b) {
            var c = a.Hc.nh();
            (b.Zd().getMetadata() || {}).XSa || a.chrome.qb.j("Page loaded.", "assertive");
            a.Hc.j && g0(a.Hc);
            d0(a.Hc, b, {
hrome, d, b)) {
                    c || this.Yi.tB(b);
                    b = a;
                    if (c = this.chrome.Ja(b)) {
                        for (d = 0; b && b !== c; )
                            d += b.offse

        var P6a, Q6a, R6a;
        _.R8 = function() {
            return !!(window.chrome && window.chrome.management && window.chrome.webstorePrivate && window.chrome.webstorePrivate.beginInstallWithManifest3)
        }
        ;

        _.S8 = function() {
            return new Promise(function(a) {
                window.chrome && window.chrome.webstorePrivate && window.chrome.webstorePrivate.isInIncognitoMode || a(!1);
                window.chrome.webstorePrivate.isInIncognitoMode(function(b) {
                    a(b)

            return _.H(function(a) {
                return a.return(new Promise(function(b) {
                    window.chrome && window.chrome.webstorePrivate && window.chrome.webstorePrivate.getFullChromeVersion || b("");
                    window.chrome.webstorePrivate.getFullChromeVersion(function(c) {
                        b(c.version_number)

                case "\u00010\u0001":
                    a.open("a", "J5jx0e");
                    a.ua(WYa || (WYa = "class Z6CGhd href https://developer.chrome.com/docs/webstore/program-policies/limited-use/ target _blank".split(" ")));
                    a.qa();
                    break;

        var x1a = function() {
            return new Promise(function(a, b) {
                window.chrome && window.chrome.webstorePrivate && window.chrome.webstorePrivate.getReferrerChain || b("");
                window.chrome.webstorePrivate.getReferrerChain(function(c) {
                    a(c)
b(0);
                    break;
                case 2:
                    if (!window.chrome || !window.chrome.management || !window.chrome.management.setEnabled)
                        throw Error("Yc");
                    d = window.chrome.management.setEnabled(a.itemId, !0);
                    return _.G(c, d, 4);
                case 4:

          , d9 = function() {
            var a = _.eb.apply(0, arguments);
            if (!window.chrome || !window.chrome.webstorePrivate || !window.chrome.webstorePrivate.beginInstallWithManifest3)
                throw Error("Yc");
            window.chrome.webstorePrivate.beginInstallWithManifest3.apply(window.chrome.webstorePrivate, _.wi(a))
        }
          , C7a = function() {
            var a = _.eb.apply(0, arguments);
            if (!window.chrome || !window.chrome.webstorePrivate || !window.chrome.webstorePrivate.completeInstall)
                throw Error("Yc");
            window.chrome.webstorePrivate.completeInstall.apply(window.chrome.webstorePrivate, _.wi(a))
        }
          , e9 = function(
 b.Ga && (_.lP(b.j),
                b.Ga = !1)
            });
            window.chrome && window.chrome.management && (chrome.management.onInstalled.addListener(this.Aa.bind(this)),
            chrome.management.onUninstalled.addListener(this.Aa.bind(this)),
            _.gj(this, function() {
                chrome.management.onInstalled.removeListener(b.Aa.bind(b));
                chrome.management.onUninstalled.removeListener(b.Aa.bind(b))
            }));
            this
ction() {
                a.v();
                var b, c;
                if (!((b = chrome.runtime) == null ? 0 : (c = b.lastError) == null ? 0 : c.message)) {
                    var d;
                    (b = (d = a.zg.data.Cb.j()) == null ? void 0 : d.getTitle()) && a.oa.j({
                        label: b + " has been removed from Chrome.",
                        Va: "U9Cmxb"
                    })
failed to install due to " + b : b
        }
          , i9 = function() {
            return window.chrome && (chrome.extension && chrome.extension.lastError && chrome.extension.lastError.message || chrome.runtime && chrome.runtime.lastError && chrome.runtime.lastError.message) || void 0
        };
        _.Q(g9.prototype, "HN
 = b || d.has("debugReviews");
                    f.o = g;
                    try {
                        !a.o && window.chrome && window.chrome.management && (chrome.management.onInstalled.addListener(a.v),
                        chrome.management.onUninstalled.addListener(a.oa),
                        a

        ;
        C7.prototype.Vf = function() {
            this.o && window.chrome && window.chrome.management && (chrome.management.onInstalled.removeListener(this.v),
            chrome.management.onUninstalled.removeListener(this.oa))
        }