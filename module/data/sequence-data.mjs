class LordOfTheMysteriesSequenceData extends foundry.abstract.TypeDataModel{

    static defineSchema() {
        const fields = foundry.data.fields;
        const requiredInteger = { required: true, nullable: false, integer: true };
        const schema = {};
        
        schema.SequenceData = new fields.SchemaField({
            pathway: new fields.SchemaField({
                common_name: new fields.StringField({ required: true}),
                other_names: new fields.ArrayField({
                    name: new fields.StringField({ required: true})
                }),
                tarrot_association: new fields.StringField({ required: true})
            }),
    
            current_sequence: new fields.SchemaField({
            title: new fields.StringField({ required: true}),
            sequence_number: new fields.NumberField({required: true, integer: true, min: 0})
            })

        });
        
        return schema;
    }
}