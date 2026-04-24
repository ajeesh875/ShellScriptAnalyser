when {
        CTX: contextdata;
        sp: servicepoint;
		root_cartitem: cartitem(root_cartitem.vid === CTX.currentrootvid); 
    }
	then {
		let gas_powervolume_family = root_cartitem.families.find(function(_i){return _i.name === 'Gas Volume and Cost'});
        let contractquantity_DMS_attribute = gas_powervolume_family.attributes.find(function(_i){return _i.name === 'Contract Quantity Hourly (DMS)'});
        let deliveryfee_DMS_attribute = gas_powervolume_family.attributes.find(function(_i){return _i.name === 'Delivery Fee Hourly'});
        let transmission_DMS_attribute = gas_powervolume_family.attributes.find(function(_i){return _i.name === 'Transmission payment, hourly read metering points:'});
        let thedailyprice_DMS_attribute = gas_powervolume_family.attributes.find(function(_i){return _i.name === 'THE Daily Price - Hourly'});
        let transmissionunits_DMS_attribute = gas_powervolume_family.attributes.find(function(_i){return _i.name === 'Transmission payment units'});
        let contractquantity_nDMS_attribute = gas_powervolume_family.attributes.find(function(_i){return _i.name === 'Contract Quantity Non-Hourly (nDMS)'});
        let hubmonthlyprice_nDMS_attribute = gas_powervolume_family.attributes.find(function(_i){return _i.name === 'HUB Monthly Price - Non hourly'});
        let deliveryfee_nDMS_attribute = gas_powervolume_family.attributes.find(function(_i){return _i.name === 'Delivery Fee Non-Hourly'});
        let transmissionpayment_nDMS_attribute = gas_powervolume_family.attributes.find(function(_i){return _i.name === 'Transmission payment, non-hourly read metering points:'});
        let contractquantityvolume_attribute = gas_powervolume_family.attributes.find(function(_i){return _i.name === 'Contract Quantity/volume'});
		let servicepoints = getFacts(servicepoint);   
        let DMS_visible = false;   
		let nDMS_visible = false;
        let spIdList = root_cartitem.spid;
        let servicepointsToUse = spIdList.split(';');
        for(let i in servicepoints){
            let servicepoint = servicepoints[i];
            let useSp = servicepointsToUse.find(x=> {return x == servicepoint._id});
            if(useSp != undefined) {
                if(servicepoint.meter_type === 'PT1H'){
                    DMS_visible = true;						
                }
                if((servicepoint.meter_type === 'P1M') ||  (servicepoint.meter_type === 'P3M') || (servicepoint.meter_type === 'P1Y')){
                    nDMS_visible = true;	
                }
            }
        }
 
		let root_children = getFacts(cartitem).filter(function(_i){return _i.rootvid === root_cartitem.vid && _i.type === 'childproduct'});            
        for(let i in root_children){
            let child_item = root_children[i];
			let indexcurrency_family = child_item.families.find(function(_i){return _i.name === 'Index Currency'});    
			if(indexcurrency_family){               
                let currencymargin_attribute = indexcurrency_family.attributes.find(function(_i){return _i.name === 'Currency Margin'});	
                let thedawithcurrency_DMS_attribute = indexcurrency_family.attributes.find(function(_i){return _i.name === 'THE DA with currency'});	
                let thedawithoutcurrency_DMS_attribute = indexcurrency_family.attributes.find(function(_i){return _i.name === 'THE DA without currency'});				
					thedawithcurrency_DMS_attribute.visible = false;
					thedawithoutcurrency_DMS_attribute.visible = false;
					if(currencymargin_attribute.value === 'Yes' && DMS_visible){
						thedawithcurrency_DMS_attribute.visible = true;
						thedawithoutcurrency_DMS_attribute.visible = false;
					}
					if(currencymargin_attribute.value === 'No' && DMS_visible){
						thedawithcurrency_DMS_attribute.visible = false;
						thedawithoutcurrency_DMS_attribute.visible = true;
					}
                let theavwithcurrency_nDMS_attribute = indexcurrency_family.attributes.find(function(_i){return _i.name === 'THE AV with currency'});
                let theavwithoutcurrency_nDMS_attribute = indexcurrency_family.attributes.find(function(_i){return _i.name === 'THE AV without currency'});
					theavwithcurrency_nDMS_attribute.visible = false;
					theavwithoutcurrency_nDMS_attribute.visible = false;
					if(currencymargin_attribute.value === 'Yes' && nDMS_visible){
						theavwithcurrency_nDMS_attribute.visible = true;
						theavwithoutcurrency_nDMS_attribute.visible = false;
					}
					if(currencymargin_attribute.value === 'No' && nDMS_visible){
						theavwithcurrency_nDMS_attribute.visible = false;
						theavwithoutcurrency_nDMS_attribute.visible = true;
					}
            } 	
			let gastransmission_family = child_item.families.find(function(_i){return _i.name === 'Gas Transmission'});    
			if(gastransmission_family){               
                let transmissionadj1_DMS_attribute = gastransmission_family.attributes.find(function(_i){return _i.name === 'Transmission adjustment DMS 1'});
                let transmissionadj2_DMS_attribute = gastransmission_family.attributes.find(function(_i){return _i.name === 'Transmission adjustment DMS 2'});
                let transmissionmargin1_DMS_attribute = gastransmission_family.attributes.find(function(_i){return _i.name === 'Transmission margin DMS 1'});	
                let transmissionmargin2_DMS_attribute = gastransmission_family.attributes.find(function(_i){return _i.name === 'Transmission margin DMS 2'});			
                let transmissionmodel_DMS_attribute = gastransmission_family.attributes.find(function(_i){return _i.name === 'Transmission model DMS'});				
					transmissionadj1_DMS_attribute.visible = DMS_visible;
					transmissionadj2_DMS_attribute.visible = DMS_visible;
					transmissionmargin1_DMS_attribute.visible = DMS_visible;
					transmissionmargin2_DMS_attribute.visible = DMS_visible;
					transmissionmodel_DMS_attribute.visible = DMS_visible;
				let transmission_nDMS_attribute = gastransmission_family.attributes.find(function(_i){return _i.name === 'Transmission nDMS'});
				let transmissionmargin_nDMS_attribute = gastransmission_family.attributes.find(function(_i){return _i.name === 'Transmission margin nDMS'});
					transmission_nDMS_attribute.visible = nDMS_visible;	
					transmissionmargin_nDMS_attribute.visible = nDMS_visible;	
            } 	
			let gasmargin_family = child_item.families.find(function(_i){return _i.name === 'Gas Margin Price'});    
			if(gasmargin_family){               
                let margin_DMS_attribute = gasmargin_family.attributes.find(function(_i){return _i.name === 'Margin DMS'});
					margin_DMS_attribute.visible = DMS_visible;
				let margin_nDMS_attribute = gasmargin_family.attributes.find(function(_i){return _i.name === 'Margin nDMS'});	
					margin_nDMS_attribute.visible = nDMS_visible;			
            }
			let gasadditionalfees_family = child_item.families.find(function(_i){return _i.name === 'Gas Additional fees'});    
			if(gasadditionalfees_family){     
				let flexfeeadj_nDMS_attribute = gasadditionalfees_family.attributes.find(function(_i){return _i.name === 'Flex fee adjustment'});
				let flexfeethe_nDMS_attribute = gasadditionalfees_family.attributes.find(function(_i){return _i.name === 'Flex fee THE'});
                let creditfeethe_nDMS_attribute = gasadditionalfees_family.attributes.find(function(_i){return _i.name === 'Credit fee'});
					flexfeeadj_nDMS_attribute.visible = nDMS_visible;			
					flexfeethe_nDMS_attribute.visible = nDMS_visible;	
                    creditfeethe_nDMS_attribute.visible = nDMS_visible;		
            }

		}	
        modify(root_cartitem, function(){						
            contractquantity_DMS_attribute.visible = DMS_visible;
            deliveryfee_DMS_attribute.visible = DMS_visible;
            transmission_DMS_attribute.visible = DMS_visible;
            thedailyprice_DMS_attribute.visible = DMS_visible;
			transmissionunits_DMS_attribute.visible = DMS_visible;
            contractquantity_nDMS_attribute.visible = nDMS_visible;
            hubmonthlyprice_nDMS_attribute.visible = nDMS_visible;
            deliveryfee_nDMS_attribute.visible = nDMS_visible;
            transmissionpayment_nDMS_attribute.visible = nDMS_visible;
			if(DMS_visible === true  && nDMS_visible === true){
				contractquantityvolume_attribute.visible = true;
			}else{
				contractquantityvolume_attribute.visible = false;				
			}
        });
    }