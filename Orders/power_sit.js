
let contractqtyhrly_attribute = null;
let contractqtynonhrly_attribute = null;
let contractqty_attribute = null;
let MarginValue_attribute = null;
let CertificateMargin_attribute = null;
let TransmissionMarginnDMS_attribute = null;
let TransmissionMarginDMS2_attribute = null;
let TransmsnMarginnDMS_attribute = null;
let TransmsnMarginDMS2_attribute = null;
let CurrencyMarginvalue_attribute = null;
let PreviousMarginValue_attribute = null;
let PreviousCertificateMargin_attribute = null;
let PreviousCurrencyMarginValue_attribute = null;
let PreviousTransmissionMarginDMS2_attribute = null;
let PreviousTransmissionMarginnDMS_attribute = null;
let DeltaMarginValue_attribute = null;
let DeltaCertificateMargin_attribute = null;
let DeltaValue = 0;
let returnPreviousMarginValue = 0;
let returnPreviousCertificateMargin = 0;
let returnPreviousCurrencyMarginvalue = 0;
let returnPreviousTransmissionMarginDMS2 = 0;
let returnPreviousTransmissionMarginnDMS = 0;
let returnMarginPrice = 0;
let returnMarginCertificate = 0;
let currencyMarginValue = 0;
let transmsnMarginnDMS = 0;
let transmsnMarginDMS2 = 0;
let ContractQuantityvolume = 0;
let CertificateMargin = 0;
let GasCertificateCost = 0;
const configurations = getFacts(configuration) || [];
const configurationFact = configurations.length > 0 ? configurations[0] : null;
let evaluateAssetValue = false;
if (configurationFact && configurationFact.type && configurationFact.type !== 'InOrder') {
    evaluateAssetValue = true;
}
const gasvolume_family = root_cartitem.families.find(f => f.name === 'Gas Volume and Cost');
if (gasvolume_family) {
    contractqtyhrly_attribute = gasvolume_family.attributes.find(a => a.name === 'Contract Quantity Hourly (DMS)');
    contractqtynonhrly_attribute = gasvolume_family.attributes.find(a => a.name === 'Contract Quantity Non-Hourly (nDMS)');
    contractqty_attribute = gasvolume_family.attributes.find(a => a.name === 'Contract Quantity/volume');
    if (contractqty_attribute) ContractQuantityvolume += contractqty_attribute.value;
}
const PreviousContractValueGas_family = root_cartitem.families.find(f => f.name === 'PreviousContractValueGas');
if (PreviousContractValueGas_family) {
    PreviousMarginValue_attribute = PreviousContractValueGas_family.attributes.find(a => a.name === 'PreviousMarginValue');
    PreviousCertificateMargin_attribute = PreviousContractValueGas_family.attributes.find(a => a.name === 'PreviousCertificateMargin');
    PreviousCurrencyMarginValue_attribute = PreviousContractValueGas_family.attributes.find(a => a.name === 'PreviousCurrencyMarginValue');
    PreviousTransmissionMarginDMS2_attribute = PreviousContractValueGas_family.attributes.find(a => a.name === 'PreviousTransmissionMarginDMS 2');
    PreviousTransmissionMarginnDMS_attribute = PreviousContractValueGas_family.attributes.find(a => a.name === 'PreviousTransmissionMarginnDMS');
}
const DeltaContractValueGas_family = root_cartitem.families.find(f => f.name == 'DeltaContractValueGas');
if (DeltaContractValueGas_family) {
    DeltaMarginValue_attribute = DeltaContractValueGas_family.attributes.find(a => a.name == 'DeltaMarginValue');
    DeltaCertificateMargin_attribute = DeltaContractValueGas_family.attributes.find(a => a.name == 'DeltaCertificateMargin');
}
const ContractValueGas_family = root_cartitem.families.find(f => f.name === 'ContractValueGas');
if (ContractValueGas_family) {
    MarginValue_attribute = ContractValueGas_family.attributes.find(a => a.name === 'MarginValue');
    CertificateMargin_attribute = ContractValueGas_family.attributes.find(a => a.name === 'CertificateMargin');
    TransmissionMarginnDMS_attribute = ContractValueGas_family.attributes.find(a => a.name === 'Transmission margin nDMS');
    TransmissionMarginDMS2_attribute = ContractValueGas_family.attributes.find(a => a.name === 'Transmission margin DMS 2');
    CurrencyMarginvalue_attribute = ContractValueGas_family.attributes.find(a => a.name === 'Currency Margin value');
    if (evaluateAssetValue) {
        if (MarginValue_attribute && PreviousMarginValue_attribute)
            returnPreviousMarginValue = MarginValue_attribute.assetvalue;
        if (CertificateMargin_attribute && PreviousCertificateMargin_attribute)
            returnPreviousCertificateMargin = CertificateMargin_attribute.assetvalue;
        if (CurrencyMarginvalue_attribute && PreviousCurrencyMarginValue_attribute)
            returnPreviousCurrencyMarginvalue = CurrencyMarginvalue_attribute.assetvalue;
        if (TransmissionMarginDMS2_attribute && PreviousTransmissionMarginDMS2_attribute)
            returnPreviousTransmissionMarginDMS2 = TransmissionMarginDMS2_attribute.assetvalue;
        if (TransmissionMarginnDMS_attribute && PreviousTransmissionMarginnDMS_attribute)
            returnPreviousTransmissionMarginnDMS = PreviousTransmissionMarginnDMS_attribute.assetvalue;
    }
}
/* Start cycle on child families and attributes */
const root_children = getFacts(cartitem).filter(i =>
    i.rootvid === root_cartitem.vid && i.type === 'childproduct'
);
root_children.forEach(child_item => {
    const GasMarginPrice_family = child_item.families.find(f => f.name === 'Gas Margin Price');
    if (GasMarginPrice_family) {
        const MarginDMS_attribute = GasMarginPrice_family.attributes.find(a => a.name === 'Margin DMS');
        const MarginnDMS_attribute = GasMarginPrice_family.attributes.find(a => a.name === 'Margin nDMS');
        if (MarginDMS_attribute && contractqtyhrly_attribute)
            returnMarginPrice += (MarginDMS_attribute.value * contractqtyhrly_attribute.value) / 100;
        if (MarginnDMS_attribute && contractqtynonhrly_attribute)
            returnMarginPrice += (MarginnDMS_attribute.value * contractqtynonhrly_attribute.value) / 100;
    }
    const GasTransmission_family = child_item.families.find(f => f.name === 'Gas Transmission');
    if (GasTransmission_family) {
        transmsnMarginnDMS_attribute = GasTransmission_family.attributes.find(a => a.name === 'Transmission margin nDMS');
        transmsnMarginDMS2_attribute = GasTransmission_family.attributes.find(a => a.name === 'Transmission margin DMS 2');
        if (transmsnMarginnDMS_attribute && contractqtynonhrly_attribute)
            transmsnMarginnDMS += (transmsnMarginnDMS_attribute.value * contractqtynonhrly_attribute.value) / 100;
        if (transmsnMarginDMS2_attribute && contractqtyhrly_attribute)
            transmsnMarginDMS2 += (transmsnMarginDMS2_attribute.value * contractqtyhrly_attribute.value) / 100;
    }
    const BiogasPrice_family = child_item.families.find(f => f.name === 'Biogas Price');
    if (BiogasPrice_family) {
        const GasCertificateCost_attribute = BiogasPrice_family.attributes.find(a => a.name === 'Certificate cost');
        const certificateMarginGas_attribute = BiogasPrice_family.attributes.find(a => a.name === 'certificate Margin');
        if (certificateMarginGas_attribute) CertificateMargin += certificateMarginGas_attribute.value;
        if (GasCertificateCost_attribute) GasCertificateCost += GasCertificateCost_attribute.value;
    }
    const IndexCurrency_family = child_item.families.find(f => f.name === 'Index Currency');
    if (IndexCurrency_family) {
        const CurrencyMarginvalue_attribute = IndexCurrency_family.attributes.find(a => a.name === 'Currency Margin value');
        if (CurrencyMarginvalue_attribute) currencyMarginValue += (CurrencyMarginvalue_attribute.value * contractqtyhrly_attribute.value + CurrencyMarginvalue_attribute.value * contractqtynonhrly_attribute.value) / 100;
    }
});
if (contractqtyhrly_attribute)
    returnMarginCertificate += ((CertificateMargin) * contractqtyhrly_attribute.value) / 100;
if (contractqtynonhrly_attribute)
    returnMarginCertificate += ((CertificateMargin) * contractqtynonhrly_attribute.value) / 100;
/* Start returnMarginePrice */
if (MarginValue_attribute) {
    modify(root_cartitem, function () {
        MarginValue_attribute.visible = true;
        MarginValue_attribute.value = parseFloat((returnMarginPrice).toFixed(3));
        MarginValue_attribute.readonly = true;
    });
}
/* END returnMarginePrice */
/* Start returnPreviousMarginPrice */
if (evaluateAssetValue === true && PreviousMarginValue_attribute) {
    modify(root_cartitem, function () {
        PreviousMarginValue_attribute.visible = true;
        returnPreviousMarginValue = Number(returnPreviousMarginValue.toFixed(2));
        PreviousMarginValue_attribute.value = returnPreviousMarginValue;
        PreviousMarginValue_attribute.readonly = true;
    });
}
/* END returnPreviousMarginPrice */
/* Start DeltaCertificateMargin - Delta = Contract - Previous */
if (evaluateAssetValue == true && DeltaMarginValue_attribute && MarginValue_attribute && PreviousMarginValue_attribute) {
    modify(root_cartitem, function () {
        DeltaMarginValue_attribute.visible = true;
        DeltaValue = returnMarginPrice - returnPreviousMarginValue;
        DeltaMarginValue_attribute.value = Number(DeltaValue.toFixed(2));
        DeltaMarginValue_attribute.readonly = true;
    });
}
/* END DeltaCertificateMargin - Delta = Contract - Previous */
/* Start returnMarginCertificate */
if (CertificateMargin_attribute) {
    modify(root_cartitem, function () {
        CertificateMargin_attribute.visible = true;
        CertificateMargin_attribute.value = parseFloat((returnMarginCertificate).toFixed(3));
        CertificateMargin_attribute.readonly = true;
    });
}
/* END returnMarginCertificate */
/* Start returnPreviousCertificateMargin */
if (evaluateAssetValue === true && PreviousCertificateMargin_attribute) {
    modify(root_cartitem, function () {
        PreviousCertificateMargin_attribute.visible = true;
        returnPreviousCertificateMargin = Number(returnPreviousCertificateMargin.toFixed(2));
        PreviousCertificateMargin_attribute.value = returnPreviousCertificateMargin;
        PreviousCertificateMargin_attribute.readonly = true;
    });
}

if (evaluateAssetValue == true && DeltaCertificateMargin_attribute && CertificateMargin_attribute && PreviousCertificateMargin_attribute) {
    modify(root_cartitem, function () {
        DeltaCertificateMargin_attribute.visible = true;
        DeltaValue = returnMarginCertificate - returnPreviousCertificateMargin;
        DeltaCertificateMargin_attribute.value = Number(DeltaValue.toFixed(2));
        DeltaCertificateMargin_attribute.readonly = true;
    });
}
/* END returnPreviousCertificateMargin */
/* Start returnTransmissionMargin */
if (TransmissionMarginnDMS_attribute) {
    modify(root_cartitem, function () {
        TransmissionMarginnDMS_attribute.visible = true;
        TransmissionMarginnDMS_attribute.value = parseFloat((transmsnMarginnDMS).toFixed(3));
        TransmissionMarginnDMS_attribute.readonly = true;
    });
}
/* END returnTransmissionMargin */
/* Start returnPreviousTransmissionMarginnDMS */
if (evaluateAssetValue === true && PreviousTransmissionMarginnDMS_attribute) {
    modify(root_cartitem, function () {
        PreviousTransmissionMarginnDMS_attribute.visible = true;
        returnPreviousTransmissionMarginnDMS = Number(returnPreviousTransmissionMarginnDMS.toFixed(2));
        PreviousTransmissionMarginnDMS_attribute.value = returnPreviousTransmissionMarginnDMS;
        PreviousTransmissionMarginnDMS_attribute.readonly = true;
    });
}
/* END returnPreviousTransmissionMarginnDMS */
/* Start returnTransmissionMarginDMS2 */
if (TransmissionMarginDMS2_attribute) {
    modify(root_cartitem, function () {
        TransmissionMarginDMS2_attribute.visible = true;
        TransmissionMarginDMS2_attribute.value = parseFloat((transmsnMarginDMS2).toFixed(3));
        TransmissionMarginDMS2_attribute.readonly = true;
    });
}
/* END returnTransmissionMarginDMS2 */
/* Start returnPreviousTransmissionMarginDMS2 */
if (evaluateAssetValue === true && PreviousTransmissionMarginDMS2_attribute) {
    modify(root_cartitem, function () {
        PreviousTransmissionMarginDMS2_attribute.visible = true;
        returnPreviousTransmissionMarginDMS2 = Number(returnPreviousTransmissionMarginDMS2.toFixed(2));
        PreviousTransmissionMarginDMS2_attribute.value = returnPreviousTransmissionMarginDMS2;
        PreviousTransmissionMarginDMS2_attribute.readonly = true;
    });
}
/* END returnPreviousTransmissionMarginDMS2 */
/* Start CurrencyMarginvalue */
if (CurrencyMarginvalue_attribute) {
    modify(root_cartitem, function () {
        CurrencyMarginvalue_attribute.visible = true;
        CurrencyMarginvalue_attribute.value = parseFloat((currencyMarginValue).toFixed(3));
        CurrencyMarginvalue_attribute.readonly = true;
    });
}
/* END CurrencyMarginvalue */
/* Start returnPreviousCurrencyMarginValue */
if (evaluateAssetValue === true && PreviousCurrencyMarginValue_attribute) {
    modify(root_cartitem, function () {
        PreviousCurrencyMarginValue_attribute.visible = true;
        returnPreviousCurrencyMarginvalue = Number(returnPreviousCurrencyMarginvalue.toFixed(2));
        PreviousCurrencyMarginValue_attribute.value = returnPreviousCurrencyMarginvalue;
        PreviousCurrencyMarginValue_attribute.readonly = true;
    });
}
/* END returnPreviousCurrencyMarginValue */

// -----------------------------
// Service point checks (Hourly vs Non-Hourly)
// -----------------------------
let servicepoints = getFacts(servicepoint) || [];
let DMS_visible = false;
let nDMS_visible = false;
let spIdList = root_cartitem.spid || "";
let servicepointsToUse = spIdList ? spIdList.split(';') : [];
for (let i in servicepoints) {
    let sp = servicepoints[i];
    let useSp = servicepointsToUse.find(x => { return x == sp._id });
    if (useSp != undefined) {
        // Try multiple fields that may exist in different implementations
        if (sp.meter_type === 'PT1H') {
            DMS_visible = true;
        } else {
            nDMS_visible = true;
        }
    }
}
