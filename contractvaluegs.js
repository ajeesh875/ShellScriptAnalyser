function getSaleYear(initial_facts) {
    var sale_year = null;
 
    if (!initial_facts || !initial_facts.cartitem) {
        return sale_year;
    }
 
    for (var i = 0; i < initial_facts.cartitem.length; i++) {
        var item = initial_facts.cartitem[i];
 
        if (!item.families) {
            continue;
        }
 
        for (var j = 0; j < item.families.length; j++) {
            var family = item.families[j];
 
            if (family.name === "Contract Quantity and Year" && family.attributes) {
                for (var k = 0; k < family.attributes.length; k++) {
                    var attr = family.attributes[k];
 
                    if (attr.name === "Contractyear") {
                        sale_year = attr.value;
                        return sale_year; 
                    }
                }
            }
        }
    }
 
    return sale_year;
}