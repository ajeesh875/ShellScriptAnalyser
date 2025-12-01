
function isProRataLiability(facts) {
    if (!facts || !facts.cartitem) return false;

    for (var i = 0; i < facts.cartitem.length; i++) {
        var families = facts.cartitem[i].families || [];
        for (var j = 0; j < families.length; j++) {
            var attrs = families[j].attributes || [];
            for (var k = 0; k < attrs.length; k++) {
                var a = attrs[k];
                if (a && a.name && a.name.toLowerCase() === 'propataliability') {
                    var v = (a.value != null) ? String(a.value).toLowerCase() : '';
                    return v === 'true';
                }
            }
        }
    }
    return false;
}


function isSpecialTaxCondition(facts) {
    if (!facts || !facts.cartitem) return false;

    for (var i = 0; i < facts.cartitem.length; i++) {
        var families = facts.cartitem[i].families || [];
        for (var j = 0; j < families.length; j++) {
            var attrs = families[j].attributes || [];
            for (var k = 0; k < attrs.length; k++) {
                var a = attrs[k];
                if (a && a.name && a.name.toLowerCase() === 'special tax condition') {
                    var v = (a.value != null) ? String(a.value).toLowerCase() : '';
                    return v === 'true';
                }
            }
        }
    }
    return false;
}


var hasProRataLiability = hasProRataLiability(initial_facts);
var hasTaxExemption = hasSpecialTaxCondition(initial_facts);