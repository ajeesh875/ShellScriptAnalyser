	when {
        CTX: contextdata;
        root_cartitem: cartitem(root_cartitem.vid === CTX.currentrootvid);        
    }
    then {
                
        let powervolume_family = root_cartitem.families.find(function(_i){return _i.name === 'PowerVolumeCost'});
        let deliveryfee_dk1_attribute = powervolume_family.attributes.find(function(_i){return _i.name === 'Delivery Fee DK1'});
        let deliveryfee_dk2_attribute = powervolume_family.attributes.find(function(_i){return _i.name === 'Delivery Fee DK2'});
        let delivery_surcharge_attribute = powervolume_family.attributes.find(function(_i){return _i.name === 'Delivery Surcharge'});
        let volumedk1_attribute = powervolume_family.attributes.find(function(_i){return _i.name === 'VolumeDK1'});
        let volumedk2_attribute = powervolume_family.attributes.find(function(_i){return _i.name === 'VolumeDK2'});
		let handlingsurcharge_dk1_attribute = powervolume_family.attributes.find(function(_i){return _i.name === 'Handling surcharge DK1'});
		let handlingsurcharge_dk2_attribute = powervolume_family.attributes.find(function(_i){return _i.name === 'Handling surcharge DK2'});
		let handlingsurcharge_attribute = powervolume_family.attributes.find(function(_i){return _i.name === 'HandlingSurcharge'});
		let fixedprice_dk1_attribute = powervolume_family.attributes.find(function(_i){return _i.name === 'Fixed Price DK1'});
		let fixedprice_dk2_attribute = powervolume_family.attributes.find(function(_i){return _i.name === 'Fixed Price DK2'});
		let fixed_price_attribute = powervolume_family.attributes.find(function(_i){return _i.name === 'Fixed Price'});
        
        let delivery_dk1 = 0;
        let delivery_dk2 = 0;
		
		let creditfee_dk1 = 0;
		let creditfee_dk2 = 0;
		
		let handling_dk1 = 0;
		let handling_dk2 = 0;
		
		let fixedprice_dk1 = 0;
		let fixedprice_dk2 = 0;
		
		let dk1_prev = 0;
		let dk2_prev = 0;

		let nordpooltradingfee = 0;
		let nordpoolannualfee = 0;
		let imbalancefeeDK1 = 0;
		let imbalancefeeDK2 = 0;
		let creditfeeadjDK1 = 0;
		let creditfeeadjDK2 = 0;
		let marginDK1 = 0;
		let marginDK2 = 0;
		
		
		
		
        let root_children = getFacts(cartitem).filter(function(_i){return _i.rootvid === root_cartitem.vid && _i.type === 'childproduct'});            
        for(let i in root_children){
            let child_item = root_children[i];
            
            let poweradditionalfees_family = child_item.families.find(function(_i){return _i.name === 'PowerAdditionalFees'}); 
            if(poweradditionalfees_family){
                let imbalancefeeDK1_attribute = poweradditionalfees_family.attributes.find(function(_i){return _i.name === 'ImbalanceFeeDK1'});
				imbalancefeeDK1 = imbalancefeeDK1_attribute.value;
                let imbalancefeeDK2_attribute = poweradditionalfees_family.attributes.find(function(_i){return _i.name === 'ImbalanceFeeDK2'});
				imbalancefeeDK2 = imbalancefeeDK2_attribute.value;
                let creditfeeDK1_attribute = poweradditionalfees_family.attributes.find(function(_i){return _i.name === 'CreditFeeDK1'});
                let creditfeeDK2_attribute = poweradditionalfees_family.attributes.find(function(_i){return _i.name === 'CreditFeeDK2'});
                let nordpooltradingfee_attribute = poweradditionalfees_family.attributes.find(function(_i){return _i.name === 'NordPoolTradingFee'});
				nordpooltradingfee = nordpooltradingfee_attribute.value;
                let nordpoolannualfee_attribute = poweradditionalfees_family.attributes.find(function(_i){return _i.name === 'NordPoolAnnualFee'});
				nordpoolannualfee = nordpoolannualfee_attribute.value;
                let CIBOR12_attribute = poweradditionalfees_family.attributes.find(function(_i){return _i.name === 'CIBOR12'});
                let commoditypriceDK1_attribute = poweradditionalfees_family.attributes.find(function(_i){return _i.name === 'CommodityPriceDK1'});
                let commoditypriceDK2_attribute = poweradditionalfees_family.attributes.find(function(_i){return _i.name === 'CommodityPriceDK2'});
				let nasdaqtradingfee_attribute = poweradditionalfees_family.attributes.find(function(_i){return _i.name === 'Nasdaq trading fee'});
				let creditfeeadjDK1_attribute = poweradditionalfees_family.attributes.find(function(_i){return _i.name === 'Credit fee adjustment DK1'});
				creditfeeadjDK1 = creditfeeadjDK1_attribute.value;
				let creditfeeadjDK2_attribute = poweradditionalfees_family.attributes.find(function(_i){return _i.name === 'Credit fee adjustment DK2'});
				creditfeeadjDK2 = creditfeeadjDK2_attribute.value;
				let imbalancefeeadjDK1_attribute = poweradditionalfees_family.attributes.find(function(_i){return _i.name === 'Imbalance fee adjustment DK1'});
				let imbalancefeeadjDK2_attribute = poweradditionalfees_family.attributes.find(function(_i){return _i.name === 'Imbalance fee adjustment DK2'});
				let imbalancefeeprodDK1_attribute = poweradditionalfees_family.attributes.find(function(_i){return _i.name === 'Imbalance fee production DK1'});
				let imbalancefeeprodDK2_attribute = poweradditionalfees_family.attributes.find(function(_i){return _i.name === 'Imbalance fee production DK2'});
			
				/* GV Already Done in EDM_INTEGRATION creditfee_dk1 = parseFloat((commoditypriceDK1_attribute.value*(CIBOR12_attribute.value/100)*52/360).toFixed(3)); */
				/* GV Already done EDM_INTEGRATION  creditfee_dk2 = parseFloat((commoditypriceDK2_attribute.value*(CIBOR12_attribute.value/100)*52/360).toFixed(3)); */
				
                if (creditfeeDK1_attribute) {
				    creditfee_dk1=creditfeeDK1_attribute.value;
			         } 
                     
                if (creditfeeDK2_attribute) {
				    creditfee_dk2=creditfeeDK2_attribute.value;
			         } 
                
                /*removed modified child credit fee */
                
                delivery_dk1 += imbalancefeeDK1_attribute.value+creditfee_dk1+nordpooltradingfee_attribute.value+nordpoolannualfee_attribute.value+nasdaqtradingfee_attribute.value+creditfeeadjDK1_attribute.value+imbalancefeeadjDK1_attribute.value;
                delivery_dk2 += imbalancefeeDK2_attribute.value+creditfee_dk2+nordpooltradingfee_attribute.value+nordpoolannualfee_attribute.value+nasdaqtradingfee_attribute.value+creditfeeadjDK2_attribute.value+imbalancefeeadjDK2_attribute.value;							
				
				handling_dk1 += nordpooltradingfee_attribute.value+nordpoolannualfee_attribute.value+imbalancefeeprodDK1_attribute.value;
				handling_dk2 += nordpooltradingfee_attribute.value+nordpoolannualfee_attribute.value+imbalancefeeprodDK2_attribute.value;
				
				fixedprice_dk1 += nordpooltradingfee_attribute.value+nordpoolannualfee_attribute.value+imbalancefeeDK1_attribute.value+creditfee_dk1+creditfeeadjDK1_attribute.value+nasdaqtradingfee_attribute.value+imbalancefeeadjDK1_attribute.value;
				fixedprice_dk2 += nordpooltradingfee_attribute.value+nordpoolannualfee_attribute.value+imbalancefeeDK2_attribute.value+creditfee_dk2+creditfeeadjDK2_attribute.value+nasdaqtradingfee_attribute.value+imbalancefeeadjDK2_attribute.value;
								
            }    
			
            let poweradditionalprice_family = child_item.families.find(function(_i){return _i.name === 'PowerAdditionalPrice'});    
			if(poweradditionalprice_family){               
                let marginDK1_attribute = poweradditionalprice_family.attributes.find(function(_i){return _i.name === 'MarginDK1'});
				marginDK1 = marginDK1_attribute.value;
                let marginDK2_attribute = poweradditionalprice_family.attributes.find(function(_i){return _i.name === 'MarginDK2'});
				marginDK2 = marginDK2_attribute.value;
                
                delivery_dk1 += marginDK1_attribute.value;
                delivery_dk2 += marginDK2_attribute.value;
				
				handling_dk1 += marginDK1_attribute.value;
				handling_dk2 += marginDK2_attribute.value;
				
				fixedprice_dk1 += marginDK1_attribute.value;
				fixedprice_dk2 += marginDK2_attribute.value;
            } 			
                    
            let extendedpayment_family = child_item.families.find(function(_i){return _i.name === 'ExtendedPayment'});
            if(extendedpayment_family){
                let extendedpaymenttermsfee_attribute = extendedpayment_family.attributes.find(function(_i){return _i.name === 'ExtendedPaymentTermsFee'});    
                delivery_dk1 += extendedpaymenttermsfee_attribute.value;
                delivery_dk2 += extendedpaymenttermsfee_attribute.value;
				
				fixedprice_dk1 += extendedpaymenttermsfee_attribute.value;
				fixedprice_dk2 += extendedpaymenttermsfee_attribute.value;
				
            }
			
			let powercertificate_family = child_item.families.find(function(_i){return _i.name === 'PowerCertificate'});
            if(powercertificate_family){
                let certificatemargin_attribute = powercertificate_family.attributes.find(function(_i){return _i.name === 'certificate Margin'});    
                let certificatecostpower_attribute = powercertificate_family.attributes.find(function(_i){return _i.name === 'CertificateCostPower'});  
                let greenelectricity_attribute = powercertificate_family.attributes.find(function(_i){return _i.name === 'GreenElectricity'});   
                modify(child_item, function(){            
					greenelectricity_attribute.value = certificatemargin_attribute.value+certificatecostpower_attribute.value;
					greenelectricity_attribute.readonly = true;
				});
            }
			
			let FlexPremium_family = child_item.families.find(function(_i){return _i.name === 'Flex Premium'});    
			if(FlexPremium_family){               
                let FlexpremiumDK1_attribute = FlexPremium_family.attributes.find(function(_i){return _i.name === 'Flexpremium DK1'});
                let FlexpremiumDK2_attribute = FlexPremium_family.attributes.find(function(_i){return _i.name === 'Flexpremium DK2'});
                
                delivery_dk1 += FlexpremiumDK1_attribute.value;
                delivery_dk2 += FlexpremiumDK2_attribute.value;
			
			    fixedprice_dk1 += FlexpremiumDK1_attribute.value;
			    fixedprice_dk2 += FlexpremiumDK2_attribute.value;
            }
			
		    let EDMIntegration_family = child_item.families.find(function(_i){return _i.name === 'EDM_Integration'});    
			if(EDMIntegration_family){               
                let SystemPriceAsk_attribute = EDMIntegration_family.attributes.find(function(_i){return _i.name === 'WA_SYSTEM_ASK'});
                let EPADDK1Ask_attribute = EDMIntegration_family.attributes.find(function(_i){return _i.name === 'WA_EPAD_DK1_ASK'});
                let EPADDK2Ask_attribute = EDMIntegration_family.attributes.find(function(_i){return _i.name === 'WA_EPAD_DK2_ASK'});
				let PEAKDK1Ask_attribute = EDMIntegration_family.attributes.find(function(_i){return _i.name === 'WA_PEAK_DK1_ASK'});
				let PEAKDK2Ask_attribute = EDMIntegration_family.attributes.find(function(_i){return _i.name === 'WA_PEAK_DK2_ASK'});
				
				
                delivery_dk1 += SystemPriceAsk_attribute.value+EPADDK1Ask_attribute.value+PEAKDK1Ask_attribute.value;
                delivery_dk2 += SystemPriceAsk_attribute.value+EPADDK2Ask_attribute.value+PEAKDK2Ask_attribute.value;
				
				fixedprice_dk1 += SystemPriceAsk_attribute.value+EPADDK1Ask_attribute.value+PEAKDK1Ask_attribute.value;
				fixedprice_dk2 += SystemPriceAsk_attribute.value+EPADDK2Ask_attribute.value+PEAKDK2Ask_attribute.value;		

				dk1_prev +=	SystemPriceAsk_attribute.value+EPADDK1Ask_attribute.value+PEAKDK1Ask_attribute.value;
				dk2_prev +=	SystemPriceAsk_attribute.value+EPADDK1Ask_attribute.value+PEAKDK1Ask_attribute.value;		
				
			}
			
			let extended_kamam_family = child_item.families.find(function(_i){return _i.name === 'Extended Payment terms(KAM/AM)'});    
			if(extended_kamam_family){               
                let dk1_kamam_attribute = extended_kamam_family.attributes.find(function(_i){return _i.name === 'DK1'});
                let dk2_kamam_attribute = extended_kamam_family.attributes.find(function(_i){return _i.name === 'DK2'});
                let marginDK1_kamam_attribute = extended_kamam_family.attributes.find(function(_i){return _i.name === 'Margin DK1'});
                let marginDK2_kamam_attribute = extended_kamam_family.attributes.find(function(_i){return _i.name === 'MarginDK2'});
				let creditfeeadjDK1_kamam_attribute = extended_kamam_family.attributes.find(function(_i){return _i.name === 'Credit fee adjustment DK1'});
				let creditfeeadjDK2_kamam_attribute = extended_kamam_family.attributes.find(function(_i){return _i.name === 'Credit fee adjustment DK2'});
				let nordpoolannualfee_kamam_attribute = extended_kamam_family.attributes.find(function(_i){return _i.name === 'NordPoolAnnualFee'});
				let nordpooltradingfee_kamam_attribute = extended_kamam_family.attributes.find(function(_i){return _i.name === 'NordPoolTradingFee'});
				let creditfeeDK1_kamam_attribute = extended_kamam_family.attributes.find(function(_i){return _i.name === 'CreditFeeDK1'});
				let creditfeeDK2_kamam_attribute = extended_kamam_family.attributes.find(function(_i){return _i.name === 'CreditFeeDK2'});
				let imbalancefeeDK1_kamam_attribute = extended_kamam_family.attributes.find(function(_i){return _i.name === 'ImbalanceFeeDK1'});
				let imbalancefeeDK2_kamam_attribute = extended_kamam_family.attributes.find(function(_i){return _i.name === 'ImbalanceFeeDK2'});
				
				let averageprice_kamam_attribute = extended_kamam_family.attributes.find(function(_i){return _i.name === 'Average price'});				
				modify(child_item, function(){	   

					nordpooltradingfee_kamam_attribute.value = nordpooltradingfee;
					nordpoolannualfee_kamam_attribute.value =  nordpoolannualfee;
					imbalancefeeDK1_kamam_attribute.value = imbalancefeeDK1;
					imbalancefeeDK2_kamam_attribute.value = imbalancefeeDK2;
					creditfeeDK1_kamam_attribute.value = creditfee_dk1;
					creditfeeDK2_kamam_attribute.value = creditfee_dk2;
					creditfeeadjDK1_kamam_attribute.value = creditfeeadjDK1;
					creditfeeadjDK2_kamam_attribute.value = creditfeeadjDK2;
					marginDK1_kamam_attribute.value = marginDK1;
					marginDK2_kamam_attribute.value = marginDK2;
							
					dk1_prev += creditfee_dk1+nordpooltradingfee+nordpoolannualfee+imbalancefeeDK1;
					dk2_prev += creditfee_dk2+nordpooltradingfee+nordpoolannualfee+imbalancefeeDK2;
				
					dk1_kamam_attribute.value = dk1_prev+marginDK1_kamam_attribute.value+creditfeeadjDK1_kamam_attribute.value;
					dk1_kamam_attribute.readonly = true;
					dk2_kamam_attribute.value = dk2_prev+marginDK2_kamam_attribute.value+creditfeeadjDK2_kamam_attribute.value;
					dk2_kamam_attribute.readonly = true;			
					if (volumedk1_attribute.value + volumedk2_attribute.value > 0) {
						averageprice_kamam_attribute.value = parseFloat((
							(dk1_kamam_attribute.value * volumedk1_attribute.value + dk2_kamam_attribute.value  * volumedk2_attribute.value) /
							(volumedk1_attribute.value + volumedk2_attribute.value)
						).toFixed(2));
					}
					averageprice_kamam_attribute.readonly = true;					
					averageprice_kamam_attribute.readonly = true;
				});				 				
			}
        }	

        modify(root_cartitem, function(){            
            deliveryfee_dk1_attribute.value = delivery_dk1;
            deliveryfee_dk1_attribute.readonly = true;
            
            deliveryfee_dk2_attribute.value = delivery_dk2;
            deliveryfee_dk2_attribute.readonly = true;    
			
			if (volumedk1_attribute.value + volumedk2_attribute.value > 0) {
				delivery_surcharge_attribute.value = parseFloat((
					(delivery_dk1 * volumedk1_attribute.value + delivery_dk2 * volumedk2_attribute.value) /
					(volumedk1_attribute.value + volumedk2_attribute.value)
				).toFixed(2));
				fixed_price_attribute.value = parseFloat((
					(fixedprice_dk1 * volumedk1_attribute.value + fixedprice_dk2 * volumedk2_attribute.value) /
					(volumedk1_attribute.value + volumedk2_attribute.value)
				).toFixed(2));
				handlingsurcharge_attribute.value = parseFloat((
					(handling_dk1 * volumedk1_attribute.value + handling_dk2 * volumedk2_attribute.value) /
					(volumedk1_attribute.value + volumedk2_attribute.value)
				).toFixed(2));
				
				
			} 
			
			handlingsurcharge_dk1_attribute.value = handling_dk1;
            handlingsurcharge_dk1_attribute.readonly = true;
			
			handlingsurcharge_dk2_attribute.value = handling_dk2;
            handlingsurcharge_dk2_attribute.readonly = true;
			
			fixedprice_dk1_attribute.value = fixedprice_dk1;
            fixedprice_dk1_attribute.readonly = true;
			
			fixedprice_dk2_attribute.value = fixedprice_dk2;
            fixedprice_dk2_attribute.readonly = true;
						
        });
    }