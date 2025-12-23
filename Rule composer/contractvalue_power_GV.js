        when {
    CTX: contextdata;
    root_cartitem: cartitem(root_cartitem.vid === CTX.currentrootvid);      
}
then {
    let MarginValue = 0;   

    let volumedk1_attribute = null;
    let volumedk2_attribute = null;
    let TotalVolume_attribute = null;
    let TotalVolume = 0;
    
    let MarginValue_attribute = null;
    let CertificateMargin_attribute = null;
    let SubscriptionFee_attribute = null;

    let PreviousMarginValue_attribute = null;
    let PreviousCertificateMargin_attribute = null;
    let PreviousSubscriptionFee_attribute = null;
    let PreviousContractValuePower_family_visibility = null;

    let DeltaMarginValue_attribute = null;
    let DeltaCertificateMargin_attribute = null;
    let DeltaSubscriptionFee_attribute = null;
    let DeltaContractValuePower_family_visibility = null; 


    let returnMarginPrice = 0;
    let returnMarginCertificate= 0;
    let returnSubscription = 0;

    let returnPreviousMarginValue= 0;
    let returnPreviousMarginCertificate= 0;
    let returnPreviousSubscription = 0;
  

    let returnDeltaMarginValue= 0;
    let returnDeltaMarginCertificate= 0;
    let returnDeltaSubscription = 0;
    
    let CertificateMargin = 0;
    let CertificateCost = 0;
    
    let TotalCertificate=0;
    let PowerCertificateCost = 0;
    
    let totalSubscriptionMonths_attribute = null;
  

    /* GV 20251127 enforce service point checks to sum properly volume and margin */
    let servicepoints = getFacts(servicepoint);   
            let DK1_visible = false;   
            let DK2_visible = false;
  
  
  let spIdList = root_cartitem.spid;
    let servicepointsToUse = spIdList.split(';');
    for(let i in servicepoints){
        let servicepoint = servicepoints[i];
        let useSp = servicepointsToUse.find(x=> {return x == servicepoint._id});
        if(useSp != undefined) {
            if(servicepoint.grid_area === 'DK1'){
                DK1_visible = true;						
            }
            if(servicepoint.grid_area === 'DK2'){
                DK2_visible = true;	
            }
        }
    }
  
           

    /* GV 20251202 enforce configuration type checks to manage Asset Contract Values of previous committed contract */


    /* configuration type checks (getFacts returns array) */
    const configurations = getFacts(configuration) || [];
    const configurationFact = configurations.length > 0 ? configurations[0] : null;
    let evaluateAssetValue = false;
    if (configurationFact && configurationFact.type && configurationFact.type !== 'InOrder') {
        evaluateAssetValue = true;
    }


    const powervolume_family = root_cartitem.families.find(f => f.name === 'PowerVolumeCost');
    if (powervolume_family) {
        volumedk1_attribute = powervolume_family.attributes.find(a => a.name === 'VolumeDK1');
        volumedk2_attribute = powervolume_family.attributes.find(a => a.name === 'VolumeDK2');
        TotalVolume_attribute = powervolume_family.attributes.find(a => a.name === 'TotalVolume');
        if (TotalVolume_attribute) TotalVolume+= TotalVolume_attribute.value;
    }


    const PreviousContractValuePower_family = root_cartitem.families.find(f => f.name === 'PreviousContractValuePower');
    if (PreviousContractValuePower_family) {
        PreviousMarginValue_attribute = PreviousContractValuePower_family.attributes.find(a => a.name === 'PreviousMarginValue');
        PreviousCertificateMargin_attribute = PreviousContractValuePower_family.attributes.find(a => a.name === 'PreviousCertificateMargin');
        PreviousSubscriptionFee_attribute = PreviousContractValuePower_family.attributes.find(a => a.name === 'PreviousSubscription');

    }

    const DeltaContractValuePower_family = root_cartitem.families.find(f => f.name === 'DeltaContractValuePower');
    if (DeltaContractValuePower_family) {
        DeltaMarginValue_attribute = DeltaContractValuePower_family.attributes.find(a => a.name === 'DeltaMarginValue');
        DeltaCertificateMargin_attribute = DeltaContractValuePower_family.attributes.find(a => a.name === 'DeltaCertificateMargin');
        DeltaSubscriptionFee_attribute = DeltaContractValuePower_family.attributes.find(a => a.name === 'DeltaSubscription');

    }


    const ContractValuePower_family = root_cartitem.families.find(f => f.name === 'ContractValuePower');
    if (ContractValuePower_family) {
        MarginValue_attribute = ContractValuePower_family.attributes.find(a => a.name === 'MarginValue');
        CertificateMargin_attribute = ContractValuePower_family.attributes.find(a => a.name === 'CertificateMargin');
        SubscriptionFee_attribute = ContractValuePower_family.attributes.find(a => a.name === 'Subscription');

        if(evaluateAssetValue) 
            { 
              if (MarginValue_attribute && PreviousMarginValue_attribute) 
                returnPreviousMarginValue = MarginValue_attribute.assetvalue;

              if (CertificateMargin_attribute && PreviousCertificateMargin_attribute)
                returnPreviousMarginCertificate = CertificateMargin_attribute.assetvalue ;

              if (SubscriptionFee_attribute && PreviousSubscriptionFee_attribute) 
                returnPreviousSubscription = SubscriptionFee_attribute.assetvalue;
        }

    }

    
    const UtilityB2B_family = root_cartitem.families.find(f => f.name === 'Utility B2B Product Setup');
    if (UtilityB2B_family) {
        totalSubscriptionMonths_attribute = UtilityB2B_family.attributes.find(a => a.name === 'totalSubscriptionMonths');
    }


/* Start cycle on child families and attributes */

    const root_children = getFacts(cartitem).filter(i => 
        i.rootvid === root_cartitem.vid && i.type === 'childproduct'
    );
    

    
    root_children.forEach(child_item => {
        
        /* GV 20251127 enforce service point checks to sum properly volume and margin */
        const PowerAdditionalPrice_family = child_item.families.find(f => f.name === 'PowerAdditionalPrice');
        if (PowerAdditionalPrice_family) {
            const MarginDK1_attribute = PowerAdditionalPrice_family.attributes.find(a => a.name === 'MarginDK1');
            const MarginDK2_attribute = PowerAdditionalPrice_family.attributes.find(a => a.name === 'MarginDK2');
            const SubscriptionFee_attribute= PowerAdditionalPrice_family.attributes.find(a => a.name === 'Subscription');
            
            if (DK1_visible && MarginDK1_attribute && volumedk1_attribute) 
                    returnMarginPrice += (MarginDK1_attribute.value * volumedk1_attribute.value)/100;

            if (DK2_visible && MarginDK2_attribute && volumedk2_attribute) 
                    returnMarginPrice += (MarginDK2_attribute.value * volumedk2_attribute.value)/100;
                    
            if (SubscriptionFee_attribute && totalSubscriptionMonths_attribute) 
                    returnSubscription +=  SubscriptionFee_attribute.value * totalSubscriptionMonths_attribute.value
                          
            }


        const PowerCertificate_family = child_item.families.find(f => f.name === 'PowerCertificate');
        if (PowerCertificate_family) {
                const PowerCertificateCost_attribute = PowerCertificate_family.attributes.find(a => a.name === 'CertificateCostPower');
                const CertificateMarginPower_attribute = PowerCertificate_family.attributes.find(a => a.name === 'certificate Margin');
                
                if (CertificateMarginPower_attribute) CertificateMargin += CertificateMarginPower_attribute.value;
                if (PowerCertificateCost_attribute) PowerCertificateCost += PowerCertificateCost_attribute.value;
          
             }
    });
    
    /* Start cycle on child families and attributes */
     /* GV 20251127 enforce service point checks to sum properly volume and margin */    
        if (DK1_visible && volumedk1_attribute) 
                    returnMarginCertificate += ((CertificateMargin) * volumedk1_attribute.value)/100;

        if ( DK2_visible && volumedk2_attribute) 
                    returnMarginCertificate += ((CertificateMargin) * volumedk2_attribute.value)/100;
                
                     
            
/* Start returnMarginePrice */
    if (MarginValue_attribute) {
        modify(root_cartitem, function() {                       
            MarginValue_attribute.visible = true;
            returnMarginPrice = Number(returnMarginPrice.toFixed(2));                     
            MarginValue_attribute.value = returnMarginPrice; 
            MarginValue_attribute.readonly = true; 
       
        });     
    } 
 /* END returnMarginePrice */ 

 /* Start returnPreviousMarginePrice */
    if (evaluateAssetValue === true && PreviousMarginValue_attribute) {
        modify(root_cartitem, function() {                       
            PreviousMarginValue_attribute.visible = true; 
            returnPreviousMarginValue = Number(returnPreviousMarginValue.toFixed(2));                      
            PreviousMarginValue_attribute.value = returnPreviousMarginValue; 
            PreviousMarginValue_attribute.readonly = true; 
       
        });     
    } 
 /* END returnPreviousMarginePrice */ 

  /* Start returnDeltaMarginePrice */
    if (evaluateAssetValue === true && DeltaMarginValue_attribute && PreviousMarginValue_attribute) {
        modify(root_cartitem, function() {                       
            DeltaMarginValue_attribute.visible = true;  
            returnDeltaMarginValue = Number((returnMarginPrice - returnPreviousMarginValue).toFixed(2));                     
            DeltaMarginValue_attribute.value = returnDeltaMarginValue ; 
            DeltaMarginValue_attribute.readonly = true; 
       
        });     
    } 
 /* END returnDeltaPreviousMarginePrice */ 
 
 /* Start returnMarginCertificate */   
    if (CertificateMargin_attribute) {
        modify(root_cartitem, function() {                       
            
            CertificateMargin_attribute.visible=true;
            returnMarginCertificate = Number(returnMarginCertificate.toFixed(2));   
            CertificateMargin_attribute.value=returnMarginCertificate;
            CertificateMargin_attribute.readonly=true;
        });    
    } 
/* END returnMarginCertificate */ 


 /* Start returnPreviousMarginCertificate */   
    if (evaluateAssetValue === true && PreviousCertificateMargin_attribute) {
        modify(root_cartitem, function() {                       
            
            PreviousCertificateMargin_attribute.visible=true;
            returnPreviousMarginCertificate = Number(returnPreviousMarginCertificate.toFixed(2));  
            PreviousCertificateMargin_attribute.value=returnPreviousMarginCertificate;
            PreviousCertificateMargin_attribute.readonly=true;
        });    
    } 
/* END returnPreviousMarginCertificate */ 

 /* Start DeltaMarginCertificate */   
    if (evaluateAssetValue === true && DeltaCertificateMargin_attribute && PreviousCertificateMargin_attribute) {
        modify(root_cartitem, function() {                       
            
            DeltaCertificateMargin_attribute.visible=true;
            returnDeltaMarginCertificate = Number((returnMarginCertificate - returnPreviousMarginCertificate).toFixed(2));  
            DeltaCertificateMargin_attribute.value=returnDeltaMarginCertificate;
            DeltaCertificateMargin_attribute.readonly=true;
        });    
    } 
/* END returnDeltaMarginCertificate */ 
 
/* START returnSubscription */   
    
    if (totalSubscriptionMonths_attribute) {

        modify(root_cartitem, function() {                       
            SubscriptionFee_attribute.visible = true;
            returnSubscription = Number(returnSubscription.toFixed(2));                       
            SubscriptionFee_attribute.value = returnSubscription; 
            SubscriptionFee_attribute.readonly = true; 
       
        }); 
    }
        
/* END returnSubscription */  


/* START returnPreviousSubscription */   
    
    if (evaluateAssetValue === true && PreviousSubscriptionFee_attribute) {

        modify(root_cartitem, function() {                       
            PreviousSubscriptionFee_attribute.visible = true; 
            returnPreviousSubscription = Number(returnPreviousSubscription.toFixed(2));                      
            PreviousSubscriptionFee_attribute.value = returnPreviousSubscription; 
            PreviousSubscriptionFee_attribute.readonly = true; 
       
        }); 
    }
        
/* END returnPreviousSubscription */  

/* START returnDeltaSubscription */   
    
    if (totalSubscriptionMonths_attribute && DeltaSubscriptionFee_attribute && PreviousSubscriptionFee_attribute) {

        modify(root_cartitem, function() {                       
            DeltaSubscriptionFee_attribute.visible = true; 
                returnDeltaSubscription = Number((returnSubscription - returnPreviousSubscription).toFixed(2));                      
            DeltaSubscriptionFee_attribute.value = returnDeltaSubscription ; 
            DeltaSubscriptionFee_attribute.readonly = true; 
       
        }); 
    }
        
/* END returnDeltaSubscription */ 



    /* START adjust volume by Service Point Checks */   
    
    if (TotalVolume_attribute) {

        modify(root_cartitem, function() { 
            
            if(!DK1_visible && volumedk1_attribute)  { 
            volumedk1_attribute.visible = true;                     
            volumedk1_attribute.value = 0; 
            } 
            if(!DK2_visible && volumedk2_attribute) { 
            volumedk2_attribute.visible = true;                     
            volumedk2_attribute.value = 0; 
            } 
            TotalVolume_attribute.visible = true; 
            TotalVolume_attribute.value = volumedk1_attribute.value + volumedk2_attribute.value
       
        }); 
    }
        
/* END adjust volume byService Point Checks */  


    
    
}