const responses = {
    // General greetings
    'hello': 'Hello! How can I assist you today?',
    'hi': 'Hello! How can I assist you today?',
    'hey': 'Hello! How can I assist you today?',
    'hi there': 'Hello! How can I assist you today?',
    'hello there': 'Hello! How can I assist you today?',
    'greetings': 'Hello! How can I assist you today?',
    'howdy': 'Hello! How can I assist you today?',
    'hey there': 'Hello! How can I assist you today?',

    // Other greetings
    'good morning': 'Good day! How can I assist you today?',
    'good afternoon': 'Good day! How can I assist you today?',
    'good evening': 'Good day! How can I assist you today?',
    'good day': 'Good day! How can I assist you today?',

    // Inquiry responses
    'how are you': 'I’m just a bot, but I’m here and ready to help you!',
    'how’s it going': 'I’m just a bot, but I’m here and ready to help you!',
    'how are things': 'I’m just a bot, but I’m here and ready to help you!',
    'how’s everything': 'I’m just a bot, but I’m here and ready to help you!',
    'how’s your day': 'I’m just a bot, but I’m here and ready to help you!',

    // Casual responses
    'what’s up': 'Not much, just here to assist you. How can I help?',
    'what’s new': 'Not much, just here to assist you. How can I help?',
    'what’s happening': 'Not much, just here to assist you. How can I help?',

    // Offering assistance
    'how can I help you': 'I’m here to assist you with whatever you need. How can I help?',
    'how can I assist you': 'I’m here to assist you with whatever you need. How can I help?',
    'welcome': 'I’m here to assist you with whatever you need. How can I help?',

    // Group greetings
    'hi everyone': 'Good to see you! How can I help you today?',
    'hello everyone': 'Good to see you! How can I help you today?',
    'hi folks': 'Good to see you! How can I help you today?',
    'good to see you': 'Good to see you! How can I help you today?',
    'nice to meet you': 'Good to see you! How can I help you today?',
    'pleased to meet you': 'Good to see you! How can I help you today?',

    // Farewell messages
    'thank you': 'You\'re welcome! If you have any other questions, feel free to ask.',
    'bye': 'Goodbye! Have a great day!',
    'goodbye': 'Goodbye! Have a great day!',
    'see you later': 'See you later! Have a wonderful day!',
    'talk to you soon': 'Talk to you soon! Don’t hesitate to reach out if you need help.',
    'take care': 'Take care! Have a great day!',
    'farewell': 'Farewell! Have a fantastic day!',
    'catch you later': 'Catch you later! Have a great day!',
    'until next time': 'Until next time! Take care!',
    'see you soon': 'See you soon! Have a wonderful day!',
    'have a good one': 'Have a good one! Take care!',
    'stay safe': 'Stay safe! Have a great day!',
    'all the best': 'All the best! Have a wonderful day!',
    'bye for now': 'Bye for now! See you soon!',
    'have a nice day': 'Have a nice day! Take care!',
    'see you around': 'See you around! Have a great day!',
    'later': 'Later! Have a good one!',
    'peace out': 'Peace out! Take care!',
    'adios': 'Adios! Have a great day!',
    'ciao': 'Ciao! See you soon!',

    // QHSE-related
    'qhse': 'QHSE stands for Quality, Health, Safety, and Environment. It encompasses all practices and standards aimed at ensuring quality, safety, and environmental compliance within an organization.',
    'importance of qhse': 'The importance of QHSE lies in its ability to improve organizational performance, ensure compliance with legal and regulatory requirements, enhance employee safety, and minimize environmental impact.',
    'qhse standards': 'QHSE standards are guidelines and requirements set to ensure quality, health, safety, and environmental management. Common standards include ISO 9001 for quality, ISO 45001 for occupational health and safety, and ISO 14001 for environmental management.',
    'how to implement qhse': 'Implementing QHSE involves establishing policies and procedures, conducting risk assessments, providing training, monitoring performance, and ensuring compliance with relevant standards and regulations.',
    'qhse policy': 'A QHSE policy outlines an organization\'s commitment to quality, health, safety, and environmental management. It sets the framework for managing QHSE aspects and achieving continuous improvement.',

    // Audit-related
    'audit': 'The Audit and Inspection Module helps in managing audits and inspections effectively. You can schedule audits, track findings, and generate reports.',
    'audit findings': 'Audit findings are the results of an audit process that identifies non-conformities, areas for improvement, and compliance with standards.',
    'audit schedule': 'You can schedule audits to ensure regular review and compliance with QHSE standards.',
    'audit checklist': 'An audit checklist includes all the criteria and areas to be reviewed during an audit, helping ensure a thorough evaluation.',
    'internal audit': 'Internal audits are conducted by the organization to evaluate its own QHSE processes and ensure compliance with internal policies and standards.',
    'external audit': 'External audits are conducted by third-party organizations to assess compliance with QHSE standards and regulations.',
    'audit report': 'The audit report provides a summary of the findings, including non-conformities, areas for improvement, and recommendations for corrective actions.',

    // Document Management
    'document management': 'The Document Management System ensures that all important documents are stored, managed, and retrieved efficiently.',
    'document control': 'Document control ensures that documents are properly managed, updated, and accessible only to authorized personnel.',
    'document retention': 'Document retention policies determine how long documents should be kept before they are disposed of or archived.',
    'document versioning': 'Document versioning tracks changes to documents over time, ensuring that the latest version is always available.',
    'document approval': 'Document approval workflows ensure that documents are reviewed and approved by the appropriate personnel before they are finalized.',
    'document access': 'Document access controls ensure that sensitive documents are accessible only to authorized users.',
    'document retrieval': 'Document retrieval systems allow users to quickly search for and retrieve documents based on keywords, metadata, or other criteria.',

    // Management of Change (MOC)
    'management of change': 'The Management of Change Module tracks changes in processes or procedures to ensure that they are implemented safely and effectively.',
    'moc process': 'The MOC process involves identifying, evaluating, and implementing changes in a controlled manner to minimize risks.',
    'moc approval': 'MOC approval is required before any significant change can be implemented, ensuring that all risks are assessed and managed.',
    'moc documentation': 'MOC documentation includes records of the proposed change, risk assessment, approvals, and implementation steps.',
    'moc training': 'MOC training ensures that all employees are aware of changes and understand how to implement them safely.',
    'moc communication': 'MOC communication involves informing all relevant stakeholders about changes and how they will be implemented.',
    'moc follow-up': 'MOC follow-up ensures that changes are implemented as planned and that any issues are addressed promptly.',

    // Asset Management
    'asset management': 'The Asset Management Module helps in managing the lifecycle of assets, including maintenance and performance monitoring.',
    'asset tracking': 'The Asset Tracking System helps in monitoring and managing the location, status, and condition of assets in real-time.',
    'maintenance management': 'The Maintenance Management Module schedules and tracks maintenance activities to ensure assets are operating efficiently and to prevent downtime.',
    'inventory management': 'The Inventory Management System keeps track of all assets, including their quantity, location, and usage, to optimize inventory levels.',
    'lifecycle management': 'The Asset Lifecycle Management Module oversees the entire lifecycle of assets from acquisition to disposal, ensuring maximum value and compliance.',
    'financial management': 'The Financial Management System tracks the financial performance of assets, including depreciation, cost allocation, and return on investment.',
    'performance monitoring': 'The Performance Monitoring System tracks the performance of assets to ensure they meet operational and strategic goals.',
    'procurement': 'The Procurement Module manages the acquisition of assets, ensuring cost-effectiveness and compliance with procurement policies.',
    'disposal': 'The Asset Disposal Module handles the end-of-life process for assets, including decommissioning, sale, or recycling, in a compliant and cost-effective manner.',

    // Training
    'training': 'The Training Module ensures that all employees receive the necessary training to meet compliance requirements and improve safety practices.',
    'document control': 'Document control involves managing the creation, distribution, and revision of documents to ensure accuracy, accessibility, and compliance.',

    // MOC
    'management of change': 'The Management of Change Module tracks changes in processes or procedures to ensure that they are implemented safely and effectively.',
    'change management': 'Change management involves planning, implementing, and reviewing changes to ensure they are executed smoothly and do not negatively impact operations.',

    // Asset
    'asset management': 'The Asset Management Module helps in managing the lifecycle of assets, including maintenance and performance monitoring.',
    'asset tracking': 'The Asset Tracking System helps in monitoring and managing the location, status, and condition of assets in real-time.',
    'maintenance management': 'The Maintenance Management Module schedules and tracks maintenance activities to ensure assets are operating efficiently and to prevent downtime.',
    'inventory management': 'The Inventory Management System keeps track of all assets, including their quantity, location, and usage, to optimize inventory levels.',
    'lifecycle management': 'The Asset Lifecycle Management Module oversees the entire lifecycle of assets from acquisition to disposal, ensuring maximum value and compliance.',
    'financial management': 'The Financial Management System tracks the financial performance of assets, including depreciation, cost allocation, and return on investment.',
    'performance monitoring': 'The Performance Monitoring System tracks the performance of assets to ensure they meet operational and strategic goals.',
    'procurement': 'The Procurement Module manages the acquisition of assets, ensuring cost-effectiveness and compliance with procurement policies.',
    'disposal': 'The Asset Disposal Module handles the end-of-life process for assets, including decommissioning, sale, or recycling, in a compliant and cost-effective manner.',

    // Training
    'training': 'The Training Module ensures that all employees receive the necessary training to meet compliance requirements and improve safety practices.',
    'training programs': 'Training programs are designed to enhance employee skills and knowledge in specific areas to ensure competency and compliance with safety and regulatory standards.',

    // Compliance
    'compliance': 'Compliance management involves ensuring that all processes and procedures meet regulatory requirements and industry standards.',
    'policy management': 'Policy management involves creating, updating, and communicating policies to ensure adherence to organizational and regulatory standards.',
    'regulatory requirements': 'Regulatory requirements are rules and regulations established by authorities that organizations must comply with to operate legally and safely.',

    // Observation
    'observation': 'The HSE Observation System helps in recording and analyzing observations related to health, safety, and environmental practices.',
    'observation types': 'Observations can be categorized into safety observations, compliance observations, and operational observations. Each type helps address specific aspects of the workplace.',
    'handling observations': 'Handling observations involves documenting the details, assessing the significance, and taking corrective actions if needed. It\'s important to ensure that observations are followed up to improve safety and compliance.',
    'observation frequency': 'The frequency of observations depends on your organization\'s policies and the specific needs of your workplace. Regular observations help in identifying potential hazards and maintaining safety standards.',
    'follow-up actions': 'Follow-up actions on observations include reviewing the reported issue, implementing corrective measures, and monitoring the effectiveness of these measures to prevent recurrence.',
    'observation training': 'Training on observations involves educating employees on how to identify and report observations effectively. This training ensures that all personnel are aware of the importance of observations and how to document them properly.',

    // Incident
    'incident': 'The HSE Incident/Accident Management System allows you to report, track, and analyze incidents and accidents to improve safety and compliance.',
    'incident reporting': 'Incident reporting involves documenting the details of an incident as soon as it occurs. This includes the date, time, location, individuals involved, and a description of the event.',
    'incident investigation': 'Incident investigation involves analyzing the causes of an incident to identify corrective actions and prevent recurrence. This process typically includes root cause analysis and implementation of preventive measures.',
    'incident response': 'Incident response includes the actions taken immediately after an incident to address the situation, ensure safety, and mitigate any potential impacts.',
    'incident tracking': 'Incident tracking involves monitoring the progress of incident investigations, corrective actions, and resolution status to ensure all incidents are managed effectively.',
    'incident analysis': 'Incident analysis involves reviewing incident data to identify trends, patterns, and areas for improvement. This helps in enhancing safety measures and reducing the likelihood of future incidents.',
    'incident follow-up': 'Incident follow-up includes verifying that corrective actions have been implemented and assessing their effectiveness in preventing similar incidents in the future.',

    // Root Cause Analysis
    'root cause analysis': 'Root cause analysis is a method used to identify the underlying causes of problems or incidents to prevent recurrence. It involves analyzing the contributing factors and implementing corrective actions.',
    'causal analysis': 'Causal analysis involves examining the causes and effects of a problem to understand the underlying issues and develop solutions.',
    'problem-solving': 'Problem-solving involves identifying, analyzing, and resolving issues to improve processes and prevent future problems.',
    'corrective actions': 'Corrective actions are steps taken to address the root cause of a problem or incident to prevent it from happening again. This may include changes to processes, procedures, or training.',
    'preventive actions': 'Preventive actions are measures implemented to reduce the likelihood of a problem or incident occurring in the future. This can involve process improvements, additional training, or changes in procedures.',

    // Feedback
    'feedback': 'Your feedback is valuable to us. It helps improve our processes and services. Please let us know your thoughts or suggestions!',
    'feedback process': 'The feedback process involves collecting, reviewing, and acting on feedback provided by users to enhance the quality of services and address any issues or concerns.',
    'feedback implementation': 'Feedback implementation involves integrating user feedback into processes, policies, or systems to improve performance and user satisfaction.',

    // Reports
    'report': 'The Reports Module provides comprehensive reporting capabilities to track performance, compliance, and other key metrics.',
    'report generation': 'Report generation involves creating detailed reports on various aspects of your operations, including audits, incidents, and compliance status.',
    'report analysis': 'Report analysis involves reviewing and interpreting report data to gain insights and make informed decisions.',
    'report customization': 'Report customization allows you to tailor reports to meet specific needs or preferences, such as including or excluding certain data, formatting, or layout options.',
    'report distribution': 'Report distribution involves sharing reports with relevant stakeholders through various channels, such as email, dashboards, or printed copies.',

    // Safety
    'safety': 'Safety management involves implementing practices and procedures to ensure a safe working environment and reduce the risk of accidents and incidents.',
    'safety measures': 'Safety measures are actions or protocols put in place to protect employees and minimize hazards in the workplace.',
    'safety protocols': 'Safety protocols are established guidelines and procedures designed to ensure safety and compliance with regulations.',
    'safety training': 'Safety training involves educating employees on safety procedures, protocols, and best practices to ensure a safe working environment.',
    'safety policies': 'Safety policies outline the rules and expectations for maintaining a safe workplace, including reporting hazards and responding to emergencies.',
    'emergency preparedness': 'Emergency preparedness involves planning and training for potential emergencies to ensure a prompt and effective response.',

    // Health
    'health': 'Health management involves promoting and maintaining the physical and mental well-being of employees within the organization.',
    'health policies': 'Health policies outline the guidelines and procedures for maintaining employee health and well-being, including medical support, wellness programs, and health assessments.',
    'health programs': 'Health programs are initiatives designed to support and improve employee health, such as wellness programs, health screenings, and mental health support.',
    'health and safety': 'Health and safety management encompasses practices and procedures to protect employees, physical and mental health, ensuring a safe and healthy work environment.',
    'mental health': 'Mental health management involves supporting employees, mental well- being through programs, resources, and policies designed to promote mental wellness and address mental health concerns.',
    'occupational health': 'Occupational health focuses on preventing and managing health issues related to the workplace, including monitoring and addressing health risks and promoting a healthy work environment.',
    'wellness': 'Wellness programs aim to enhance employees, overall health and well - being through various activities and initiatives, such as fitness programs, nutrition guidance, and stress management.',
};

// Export responses
module.exports = responses;