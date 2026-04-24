when {
    CTX: contextdata;
    root_cartitem: cartitem(root_cartitem.vid === CTX.currentrootvid);
    conf: configuration;
}
then {

    let Contract_QandY_family;
    let Contract_Quantity_source;

    const configurations = getFacts(configuration) || [];
    const configurationFact = configurations.length > 0 ? configurations[0] : null;


    // get the correct family
    Contract_QandY_family = root_cartitem.families.find(f => f.name === 'Contract Quantity and Year');

    // find the attribute inside the same family
    if (Contract_QandY_family) {
        Contract_Quantity_source = Contract_QandY_family.attributes.find(a => a.name === 'Contract Quantity/volume');
    }

    if (configurationFact) {

        modify(configurationFact, function () {
            configurationFact.totalvolumeconsumption = Contract_Quantity_source.value;
        });
    }

}