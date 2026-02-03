'use client';

import { useEffect } from 'react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  primaryColor?: string;
}

export function TermsModal({ isOpen, onClose, primaryColor = '#0d9488' }: TermsModalProps) {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4"
          style={{ borderBottomColor: primaryColor }}
        >
          <h2 className="text-xl font-bold text-gray-900">Holibob Agency Terms & Conditions</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[calc(90vh-140px)] overflow-y-auto px-6 py-6">
          <div className="prose prose-sm max-w-none text-gray-700">
            <p className="text-gray-600">
              Except where otherwise specified, we, Holibob Limited, a company registered in
              Scotland with company number SC631937 and registered office address of 20 Braid Mount,
              Edinburgh, Scotland EH10 6JJ act only as an agent in respect of all bookings we take
              and/or make on your behalf.
            </p>

            <p>
              We accept no liability in relation to any contract you enter into or for any Tours or
              Experiences or other services you purchase (&quot;Arrangements&quot;) or for the acts
              or omissions of any supplier or other person(s) or party(ies) connected with any
              arrangements. For all Arrangements, your contract will be with the supplier of the
              arrangements in question (the &quot;Supplier/Principal&quot;).
            </p>

            <p>
              By making a booking with us, the first named person on the booking agrees on behalf of
              all persons detailed on the booking that he/she:
            </p>

            <ol className="list-alpha ml-4 space-y-2">
              <li>read these Agency Terms & Conditions and agree to be bound by them;</li>
              <li>
                consents to our use of personal data in accordance with our Privacy Policy and is
                authorised on behalf of all persons named on the booking to disclose their personal
                details to us, including where applicable, special categories of data (such as
                information on health conditions or disabilities and dietary requirements);
              </li>
              <li>
                is over 18 years of age and where placing an order for services with age
                restrictions you declare that you and all members of your party are of the
                appropriate age to purchase those services;
              </li>
              <li>
                accepts financial responsibility for payment of the booking on behalf of all persons
                detailed on the booking.
              </li>
            </ol>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">Contract</h3>
            <p>
              When making your booking we will arrange for you to enter into a contract with the
              applicable Supplier/Principal (e.g. Tours and Experiences provider) of the
              Arrangements, as specified on your confirmation invoice. As agent we accept no
              responsibility for the acts or omissions of the Supplier/Principal or for the services
              provided by them. Your booking with us is subject to these Agency Terms and Conditions
              and the specific terms and conditions of the relevant Supplier/Principal(s) you
              contract with and you are advised to read both carefully prior to booking. The
              Supplier/Principal&apos;s booking conditions may limit and/or exclude the
              Supplier/Principal&apos;s liability to you. Please ask us for copies of these if you
              do not have them.
            </p>
            <p>
              Your booking is confirmed and a contract between you and the Supplier/Principal will
              exist when we send you confirmation on their behalf.
            </p>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">Booking</h3>
            <p>
              When a booking is made all details will be provided to you to check. Once you have
              confirmed these details we will proceed to confirm the booking with the
              Supplier/Principal.
            </p>
            <p>
              Please check that all names, dates and timings are correct on receipt of all documents
              and advise us of any errors immediately. Any changes to these details will incur the
              charges stated below. Please ensure that the names given are the same as in the
              relevant passport.
            </p>
            <p>
              The booking information that you provide to us will be passed on only to the relevant
              Supplier/Principal of your Arrangements or other persons necessary for the provision
              of your Arrangements.
            </p>
            <p>
              The information may be provided to public authorities such as customs or immigration
              if required by them, or as required by law. This applies to any special category
              (sensitive) information that you give to us such as details of any disabilities, or
              dietary and religious requirements. In making this booking, you consent to this
              information being passed on to the relevant persons.
            </p>
            <p>
              Certain information may also be passed on to security or credit checking companies. If
              you are travelling to the United States, the US Customs and Border Protection will
              receive this information for the purposes of preventing and combating terrorism and
              other transnational serious crimes. If you travel outside the European Economic Area,
              controls on data protection may not be as strong as the legal requirements in this
              country. If we cannot pass this information to the relevant suppliers, whether in the
              EEA or not, we will be unable to provide your booking.
            </p>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">Payment</h3>
            <p>
              In order to book your chosen Arrangements, you must pay in full at the time of
              booking, unless expressly stated otherwise as required by the Supplier/Principal of
              the Arrangements. You must also pay all applicable insurance premiums and booking
              fees.
            </p>
            <p>
              If you have paid a deposit, you must pay the full balance by the balance due date
              notified to you. If full payment is not received by the balance due date, we will
              notify the Supplier/Principal who may cancel your booking and charge the cancellation
              fees set out in their booking conditions.
            </p>
            <p>
              Except where otherwise advised or stated in the booking conditions of the
              Supplier/Principal concerned, all monies you pay to us for Arrangements will be held
              on behalf of the Supplier/Principal and forwarded on to the Supplier/Principal in
              accordance with our agreement with the Supplier/Principal.
            </p>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">Prices</h3>
            <p>
              Unless otherwise stated at the time of booking, prices include all applicable taxes.
              We reserve the right to amend advertised prices at any time. We also reserve the right
              to correct errors in both advertised and confirmed prices. Special note: changes and
              errors sometimes occur. You must check the price of your chosen Arrangements at the
              time of booking.
            </p>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">Insurance</h3>
            <p>
              Many Supplier/Principals require you to take out travel insurance as a condition of
              booking with them. In any event, we strongly advise that you take out a policy of
              insurance in order to cover you and your party against the cost of cancellation by
              you; the cost of assistance (including repatriation) in the event of accident or
              illness; loss of baggage and money; and other expenses.
            </p>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">Special Requests</h3>
            <p>
              If you have any special requests (for example dietary requirements, cots or room
              location), please let us know via email. We will pass on all such requests to the
              Supplier/Principal, but we can&apos;t guarantee that they will be met and we will have
              no liability to you if they are not.
            </p>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">
              Changes and Cancellations by You
            </h3>
            <p>
              Any cancellation or amendment request must be sent to Holibob in writing, by email,
              and will take effect at the time we receive it. Please ensure that you have received
              written confirmation of any changes to your booking prior to travel. Whilst we will
              try to assist, we cannot guarantee that the Supplier/Principal will meet such
              requests. Amendments and cancellations can only be accepted in accordance with the
              terms and conditions of the Supplier/Principal of your Arrangements. The
              Supplier/Principal may charge the cancellation or amendment charges shown in their
              booking conditions (which may be as much as 100% of the cost of the Arrangements and
              will normally increase closer to the date of departure).
            </p>
            <p>
              Please note: some Supplier/Principals do not allow changes and therefore full
              cancellation charges will apply.
            </p>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">
              Changes and Cancellations by the Supplier/Principal
            </h3>
            <p>
              We will inform you as soon as reasonably possible if the Supplier/Principal needs to
              make a significant change to your confirmed Arrangements or to cancel them. We will
              also liaise between you and the Supplier/Principal in relation to any alternative
              arrangements offered by the Supplier/Principal but we will have no further liability
              to you.
            </p>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">Our Service Charges</h3>
            <p>
              In certain circumstances we apply a service charge for the agency service we provide,
              in addition to any charge levied by the Supplier/Principal, as follows:
            </p>
            <table className="my-4 w-full border-collapse border border-gray-300 text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-4 py-2 text-left">Service</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Charge</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 px-4 py-2">Cancellation or amendment</td>
                  <td className="border border-gray-300 px-4 py-2">Principal&apos;s charge</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-4 py-2">
                    Special requests after booking has been confirmed
                  </td>
                  <td className="border border-gray-300 px-4 py-2">Principal&apos;s charge</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-4 py-2">
                    Collection of surcharges/additional taxes
                  </td>
                  <td className="border border-gray-300 px-4 py-2">Principal&apos;s charge</td>
                </tr>
              </tbody>
            </table>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">
              Our Responsibility for Your Booking
            </h3>
            <p>
              Your contract is with the Supplier/Principal and its booking conditions apply. As
              agent, we accept no responsibility for the actual provision of the Arrangements. Our
              responsibilities are limited to making the booking in accordance with your
              instructions. We accept no responsibility for any information about the Arrangements
              that we pass on to you in good faith. However, in the event that we are found liable
              to you on any basis whatsoever, our maximum liability to you is limited to twice the
              cost of the commission we earn on your booking (or the appropriate proportion of this
              if not everyone on the booking is affected). We do not exclude or limit any liability
              for death or personal injury that arises as a result of our negligence or that of any
              of our employees whilst acting in the course of their employment.
            </p>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">
              Visa, Passport and Health Requirements
            </h3>
            <p>
              We can provide general information about the passport and visa requirements for your
              trip. Your specific passport and visa requirements, and other immigration requirements
              are your responsibility and you should confirm these with the relevant Embassies
              and/or Consulates. Neither we nor the Supplier/Principal accept any responsibility if
              you cannot travel because you have not complied with any passport, visa or immigration
              requirements. Please note that these requirements may change between booking and
              departure. Most countries now require passports to be valid for at least 6 months
              after your return date. We can provide general information about any health
              formalities required for your trip but you should check with your own doctor for your
              specific circumstances.
            </p>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">Complaints</h3>
            <p>
              Because the contract for your Arrangements is between you and the Supplier/Principal,
              any queries or concerns about your Arrangements should be addressed to them, however
              Holibob will be the main point of contact with all communication in regards to your
              booking. If you have a problem with your Arrangements whilst using them, this must be
              reported to the Supplier/Principal immediately. If you fail to follow this procedure
              there will be less opportunity for the Supplier/Principal to investigate and rectify
              your complaint. The amount of compensation you may be entitled to may therefore be
              reduced or extinguished as a result.
            </p>
            <p>
              If you wish to complain when you return home, write to Holibob and we will happily
              assist with this complaint on behalf of yourself and the Supplier/Principal.
            </p>
            <p>
              If you wish to complain about any service we have provided to you (i.e. our booking
              service) then please contact us directly.
            </p>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">Delivery of Documents</h3>
            <p>
              All documents (e.g. invoices/tickets/Insurance policies) will be sent to you via
              email. Once documents leave our offices we will not be responsible for their loss
              unless such loss is due to our negligence.
            </p>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">Law and Jurisdiction</h3>
            <p>
              These Agency Terms & Conditions are governed by English law and we both agree that the
              courts of England and Wales have exclusive jurisdiction (unless you live in Scotland
              or Northern Ireland, in which case you can bring proceedings in your local court under
              Scottish or Northern Irish law, as applicable).
            </p>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">Ratings and Standards</h3>
            <p>
              All ratings are as provided by the relevant Supplier/Principal. These are intended to
              give a guide to the services and facilities you should expect from your Arrangements.
              Standards and ratings may vary between countries, as well as between suppliers. We
              cannot guarantee the accuracy of any ratings given.
            </p>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">
              Documentation & Information
            </h3>
            <p>
              All descriptions and content on our website or otherwise issued by us is done so on
              behalf of the Supplier/Principal in question and are intended to present a general
              idea of the services provided by the Supplier/Principal. Not all details of the
              relevant services can be included on our website. All services shown are subject to
              availability. If you require any further details, in respect of any Arrangements or
              any other services please contact us.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t bg-white px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-lg py-3 font-semibold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
